import { ARCHER_TYPE, CRACHEUR_TYPE, SORCIER_TYPE, ENEMIES, FLOW, ITEM, It, SYN, Syn, HAZARDS, REVIVE, ENEMY_SEPARATION, GOLD, KNOCKBACK_DECAY, PLAYER, PLAY_LIMIT, SLIDE, SPAWN, SPELL, VOLANT_TYPE, TRAIT, POWER, TERRAIN } from './balance';
import { isCharger, tickCharger, tickEruptions } from './hazards';
import { ignoresGround, tickArcher, tickBoss, tickFlyer, tickSorcier, tickSpitter } from './bosses';
import { compactEnemies } from './combat';
import { LEVEL_REROLL, applyCard, nextChoice, rerollLevel, tickChests, tickGems } from './progression';
import { merchantInput, tickMerchant } from './merchant';
import { tickPOI } from './poi';
import { healTick, shieldAbsorb, shieldTick, tickRideItems } from './items';
import { gradAt } from './terrain';
import { castSpell, tickSpells } from './spells';
import { hitEnemy } from './combat';
import { respawnNear, spawnEnemy, tickSpawner } from './spawner';
import { tickStage, retargetBoss } from './stages';
import { Ev, HitSrc, HurtSrc, Mode, Pw, ShotKind, Spell, Trait } from './types';
import { tickPowers } from './powers';
import type { Input } from './types';
import { placeFire, placeMine, tickProjectiles, tickWeapons } from './weapons/tick';
import { discover } from './world';
import type { World } from './world';

const out2 = new Float64Array(2);
const g2 = new Float64Array(2);
const mv = new Float64Array(2);
const fl = new Float64Array(2);
const nb = new Int32Array(64);
const TAU = Math.PI * 2;

/** Place les ennemis de départ. À appeler une fois après la construction. */
export function startRun(w: World): void {
  for (let i = 0; i < SPAWN.initial; i++) spawnEnemy(w, 0, w.rng.range(0, TAU), w.rng.range(14, 20));
}

/**
 * Avance la simulation d'un pas fixe. Pure : même monde + même input ⇒ même résultat.
 * Les événements de ce pas sont dans w.events[0..w.eventCount).
 */
export function step(w: World, input: Input, dt: number): void {
  w.clearEvents();
  if (w.mode === Mode.Dead || w.mode === Mode.Won) return;
  if (w.mode === Mode.LevelUp) {
    if (input.pick === LEVEL_REROLL) rerollLevel(w); // phase 31 : relance des cartes
    else if (input.pick >= 0) applyCard(w, input.pick);
    return;
  }
  if (w.mode === Mode.Merchant) {
    if (input.pick >= 0) merchantInput(w, input.pick); // phase 17 : achat, relance ou départ
    return;
  }
  w.t += dt;
  stepPlayer(w, input, dt);
  tickStage(w, dt); // phase 37 : chrono du monde, prolongation, totem, portail (peut changer de carte)
  // phase 35 : Temps figé, plus d'apparitions, de tirs ennemis ni de dangers (les ennemis restent touchables)
  const frozen = w.powerT[Pw.Gel] > 0;
  if (!frozen) tickSpawner(w, dt);
  w.grid.build(w.enemies, w.enemyCount, w.player.x, w.player.z);
  w.flow.tick(w, dt);
  stepEnemies(w, dt);
  if (!frozen) {
    tickEruptions(w);
    tickShots(w, dt);
  }
  tickWeapons(w, dt);
  tickSpells(w, dt); // phase 19 : coups des sorts (grille à jour)
  tickProjectiles(w, dt);
  tickRideItems(w, dt); // phase 28 : Patins de braise, Corne de guerre
  compactEnemies(w);
  retargetBoss(w); // phase 39 : la barre passe tout de suite au boss suivant (monde infini)
  tickGems(w, dt);
  tickChests(w, dt);
  tickPowers(w, dt); // phase 35 : bonus au sol
  tickMerchant(w); // phase 17 : peut ouvrir l'échoppe (Mode.Merchant)
  tickPOI(w, dt); // phase 18 : coffres de carte et sanctuaires
  discover(w, dt); // phase 27 : cases découvertes (carte)
  shieldTick(w, dt); // phase 28 : recharge du Bouclier (le coup est annulé là où il est reçu)
  // défi « Intouchable » : plus longue période sans dégât (hurtAt est posé là où PlayerHurt est émis)
  if (w.t - w.hurtAt > w.noHitBest) w.noHitBest = w.t - w.hurtAt;
  if ((w.mode as Mode) === Mode.Won) {
    // bonus d'or de la victoire : payé par stageBossDown (phase 39)
  } else if (w.player.hp <= 0 && w.player.revives > 0) {
    // réanimation (boutique) : une seconde chance, puis on sort de la masse
    const P = w.player;
    P.revives--;
    P.hp = P.maxHp * REVIVE.hpFrac;
    P.invul = Math.max(P.invul, REVIVE.invul);
    w.emit(Ev.Revive, P.x, P.y + 1, P.z, P.revives);
  } else if (w.player.hp <= 0) {
    w.player.hp = 0;
    w.mode = Mode.Dead;
    w.gold += (w.t - w.goldBonusT) * GOLD.perSecond * w.player.goldMul; // bonus de fin : secondes survécues / 10
    w.emit(Ev.Death, w.player.x, 1, w.player.z, w.t);
  } else if ((w.mode as Mode) === Mode.Play && (w.itemPicks > 0 || w.boonPicks > 0 || w.pending > 0)) {
    nextChoice(w); // objets des coffres d'abord, puis bonus de sanctuaire, puis montées de niveau
  }
}

/** Bottes de saut (phase 17) : l'atterrissage repousse les ennemis au sol dans ITEM.bottes.r. */
function landingShockwave(w: World): void {
  const P = w.player,
    B = ITEM.bottes;
  for (let i = 0; i < w.enemyCount; i++) {
    const e = w.enemies[i];
    if (!e.alive || ENEMIES[e.type].boss) continue;
    const dx = e.x - P.x,
      dz = e.z - P.z,
      d2 = dx * dx + dz * dz;
    if (d2 > B.r * B.r || d2 < 1e-6) continue;
    const d = Math.sqrt(d2),
      k = B.kb * w.itemEff[It.Bottes] * ENEMIES[e.type].kbMul * (1 - d / B.r); // phase 38 : recul × exemplaires
    e.kx += (dx / d) * k;
    e.kz += (dz / d) * k;
  }
  w.emit(Ev.Shockwave, P.x, 0, P.z, B.r);
}

/** Plume (phase 28) : gravité réduite en l'air avec l'élan d'une glissade ; phase 38 : × gravMul par exemplaire, plancher. */
function plumeGrav(w: World): number {
  return Math.max(ITEM.plume.min, ITEM.plume.gravMul ** w.itemEff[It.Plume]);
}

/**
 * 1.30.1 : glisse parfaite, la glisse est appuyée au bon moment de la réception. On repart en glissade avec la vitesse
 * du vol (au moins le départ d'une glissade normale) dans la direction tenue, sans attendre la recharge ; l'élan (SLIDE.elanMul) récompense le
 * bon timing, et l'Écharpe du vent soigne.
 */
function perfectSlide(w: World, hx: number, hz: number, walk: number, ix: number, iz: number, l: number): void {
  const P = w.player;
  const h = Math.sqrt(hx * hx + hz * hz);
  // 1.30.2 (Jimmy) : la glissade part dans la direction tenue au moment de l'appui (changer de direction en l'air puis
  // re-glisser tourne la glissade) ; sans entrée, elle suit l'élan du vol
  if (l > SLIDE.startInput) {
    P.dirX = ix / l;
    P.dirZ = iz / l;
  } else if (h > 0.5) {
    P.dirX = hx / h;
    P.dirZ = hz / h;
  }
  const v0 = Math.max(h, walk * SLIDE.startMul, P.sliding ? Math.sqrt(P.mvx * P.mvx + P.mvz * P.mvz) : 0);
  P.mvx = P.dirX * v0;
  P.mvz = P.dirZ * v0;
  if (!P.sliding) w.emit(Ev.SlideStart, P.x, 0, P.z, v0);
  P.sliding = true;
  P.slideCd = 0;
  P.landGrace = 0;
  P.elanT = SLIDE.elanTime;
  w.tricks++;
  if (w.items[It.Echarpe]) {
    // phase 28 : Écharpe du vent
    P.hp = Math.min(P.maxHp, P.hp + ITEM.echarpe.heal * w.itemEff[It.Echarpe]); // phase 38 : × exemplaires
    P.spellCd -= ITEM.echarpe.spell * w.itemEff[It.Echarpe];
  }
  w.emit(Ev.Trick, P.x, 0, P.z, v0);
}

/** 1.31.3 : (x, z) au bord d'un tremplin, en le descendant dans son sens : le seul endroit où une glissade décolle. */
function atKickerLip(w: World, x: number, z: number, vx: number, vz: number): boolean {
  for (let i = 0; i < w.kickers.length; i++) {
    const k = w.kickers[i];
    if (vx * k.dx + vz * k.dz <= 0) continue;
    const lx = k.x + k.dx * TERRAIN.kickLen,
      lz = k.z + k.dz * TERRAIN.kickLen;
    const dx = x - lx,
      dz = z - lz;
    const along = dx * k.dx + dz * k.dz,
      lat = Math.abs(-dx * k.dz + dz * k.dx);
    if (along > -SLIDE.kickLip && along < SLIDE.kickLip && lat < TERRAIN.kickHalf + 1) return true;
  }
  return false;
}

function stepPlayer(w: World, input: Input, dt: number): void {
  const P = w.player;
  P.px = P.x;
  P.pz = P.z;
  P.py = P.y;
  let ix = input.mx,
    iz = input.mz;
  let l = Math.sqrt(ix * ix + iz * iz);
  if (l > 1) {
    ix /= l;
    iz /= l;
    l = 1;
  }
  if (l > 0.05 && !P.sliding) {
    P.dirX = ix / l;
    P.dirZ = iz / l;
  }
  // phase 27 : glisse à l'appui (front montant : la tenir ne compte qu'une fois) ; au sol, un appui lance la glissade
  // ou relève le joueur ; 1.30.1 : en l'air, il prépare la réception (glisse parfaite si le sol arrive à temps)
  const slideIn = input.slide === true;
  let slidePress = slideIn && !P.slideHeld;
  P.slideHeld = slideIn;
  if (P.elanT > 0) P.elanT -= dt;
  if (P.slideCd > 0) P.slideCd -= dt;
  const walk = P.speed * (P.elanT > 0 ? SLIDE.elanMul : 1) * (w.powerT[Pw.Vitesse] > 0 ? POWER.speedMul : 1); // phase 35 : Élan
  // 1.31.2 : un appui en l'air est gardé SLIDE.jumpBuf s (saut dès la réception) ; juste après un envol, il compte encore
  if (P.jumpBuf > 0) P.jumpBuf -= dt;
  if (P.coyote > 0) P.coyote -= dt;
  const coyote = !P.onGround && P.coyote > 0;
  if (input.jump && !P.onGround && !coyote) P.jumpBuf = SLIDE.jumpBuf;
  if ((input.jump || P.jumpBuf > 0) && (P.onGround || coyote)) {
    let vy = PLAYER.jumpVel * P.jumpMul; // phase 17 : Bottes de saut
    if (P.sliding || coyote) {
      // saut glissé : l'élan part avec le joueur ; sur une rampe qui monte, la montée du sol s'ajoute au saut
      vy += Math.max(0, P.gv);
      P.sliding = false;
      P.airMom = true;
      P.slideJump = true; // 1.24.1 (Jimmy) : sauter annule la glissade ; l'élan porte le saut, la réception se fait debout
      w.emit(Ev.Launch, P.x, P.y, P.z, Math.sqrt(P.mvx * P.mvx + P.mvz * P.mvz));
    }
    P.vy = vy;
    P.onGround = false;
    P.airT = 0;
    P.slideBuf = 0;
    P.landGrace = 0;
    P.jumpBuf = 0;
    P.coyote = 0;
    w.emit(Ev.Jump, P.x, P.y, P.z);
  }
  if (input.spell && P.spellCd <= 0) castSpell(w, P.dirX, P.dirZ); // phase 19 : sort de classe (ancien dash)
  if (P.dashT > 0 && (P.sliding || P.airMom)) {
    P.sliding = false; // un Bond ou une Comète reprend la main sur l'élan
    P.airMom = false;
  }
  // 1.30.1 : glisse au bon moment de la réception. En l'air, l'appui est gardé SLIDE.landPre s ; juste après avoir
  // touché le sol, il compte encore SLIDE.landPost s (avec l'élan du vol)
  if (P.slideBuf > 0) P.slideBuf -= dt;
  if (P.landGrace > 0) P.landGrace -= dt;
  if (slidePress && !P.onGround) {
    P.slideBuf = SLIDE.landPre;
    slidePress = false;
  } else if (slidePress && P.onGround && P.landGrace > 0) {
    perfectSlide(w, P.landMx, P.landMz, walk, ix, iz, l);
    slidePress = false;
  }
  // relevé : un appui pendant la glissade remet le joueur debout (l'appui est consommé)
  if (slidePress && P.onGround && P.sliding) {
    P.sliding = false;
    P.slideCd = SLIDE.cd;
    slidePress = false;
    w.emit(Ev.SlideEnd, P.x, 0, P.z, Math.sqrt(P.mvx * P.mvx + P.mvz * P.mvz));
  }
  // départ de glissade : au sol, en mouvement, droit devant
  if (slidePress && P.onGround && !P.sliding && P.slideCd <= 0 && l > SLIDE.startInput && P.dashT <= 0) {
    const cur = Math.sqrt(P.vx * P.vx + P.vz * P.vz),
      v0 = Math.max(cur, walk * SLIDE.startMul);
    P.mvx = P.dirX * v0;
    P.mvz = P.dirZ * v0;
    P.sliding = true;
    w.emit(Ev.SlideStart, P.x, 0, P.z, v0);
  }
  let vx: number, vz: number;
  if (P.sliding) {
    // ligne droite : la direction est celle du départ ; la pente dans cette direction accélère (descente) ou freine
    // (montée), un frottement constant use l'élan ; ni la pente de côté ni l'entrée ne font tourner
    gradAt(w.height, P.x, P.z, g2);
    const dx = P.dirX,
      dz = P.dirZ;
    let sp = P.mvx * dx + P.mvz * dz; // élan dans l'axe (un obstacle a pu en absorber une partie)
    sp -= (g2[0] * dx + g2[1] * dz) * SLIDE.grav * dt;
    const fr = w.speedAt(P.x, P.z) < 1 ? SLIDE.lakeFriction : SLIDE.friction;
    sp = Math.max(0, sp - fr * dt);
    const cap = walk * SLIDE.maxMul;
    if (sp > cap) sp = cap;
    P.mvx = dx * sp;
    P.mvz = dz * sp;
    if (sp < walk * SLIDE.endMul) {
      P.sliding = false;
      P.slideCd = SLIDE.cd;
      w.emit(Ev.SlideEnd, P.x, 0, P.z, sp);
    }
  }
  if (P.sliding) {
    vx = P.mvx;
    vz = P.mvz;
  } else if (!P.onGround && P.airMom) {
    // saut glissé ou envol : l'élan porte, l'entrée corrige un peu
    vx = P.mvx + ix * walk * SLIDE.airControl;
    vz = P.mvz + iz * walk * SLIDE.airControl;
  } else {
    // lac : ralentit au sol seulement ; phase 18 : la pente aussi (montée plus lente, descente plus rapide)
    let sp = walk * (P.onGround ? w.speedAt(P.x, P.z) * w.slopeMul(P.x, P.z, ix, iz) : 1);
    if (P.dashT > 0) {
      P.dashT -= dt;
      sp *= PLAYER.dashMul;
      ix = P.dirX;
      iz = P.dirZ;
    }
    if (P.spellT > 0) {
      if (w.spell === Spell.Tourbillon) sp *= SPELL.tourbillon.speedMul;
      else if (w.spell === Spell.Voile) sp *= SPELL.voile.speedMul;
    }
    vx = ix * sp;
    vz = iz * sp;
  }
  P.vx = vx;
  P.vz = vz;
  P.x += P.vx * dt;
  P.z += P.vz * dt;
  P.spellCd -= dt;
  if (P.spellRefund < ITEM.collier.bank) P.spellRefund = Math.min(ITEM.collier.bank, P.spellRefund + ITEM.collier.perSec * dt); // phase 22 : Collier
  P.invul -= dt;
  if (P.recoil > 0) P.recoil = Math.max(0, P.recoil - dt);
  // phase 16 : murets et troncs se franchissent en plein saut (P.y), arbres, rochers et menhirs jamais
  w.resolveObstacles(P.x, P.z, 0.4, out2, P.y);
  P.x = Math.max(-PLAY_LIMIT, Math.min(PLAY_LIMIT, out2[0]));
  P.z = Math.max(-PLAY_LIMIT, Math.min(PLAY_LIMIT, out2[1]));
  if (P.sliding || P.airMom) {
    // un obstacle absorbe l'élan : la vitesse conservée devient le déplacement réel
    P.mvx = (P.x - P.px) / dt - (P.airMom ? ix * walk * SLIDE.airControl : 0);
    P.mvz = (P.z - P.pz) / dt - (P.airMom ? iz * walk * SLIDE.airControl : 0);
  }
  // phase 27 : y reste la hauteur au-dessus du sol local, mais l'altitude est absolue en l'air (le sol qui descend sous
  // un joueur en vol le laisse plus haut) ; au sol, une crête franchie vite fait décoller
  const g = w.heightAt(P.x, P.z);
  const dg = g - P.gPrev;
  const teleport = dg > SLIDE.teleport || dg < -SLIDE.teleport; // déplacement d'un test ou réapparition : pas de physique sur ce pas
  if (!teleport) {
    const gv = dg / dt;
    if (!P.onGround) P.y -= dg;
    else {
      const h2 = P.vx * P.vx + P.vz * P.vz;
      const fast = P.sliding || h2 > (walk * SLIDE.launchMin) ** 2;
      // chute de la pente dans le sens du déplacement (gv / vitesse = pente parcourue), au bord d'un tremplin seulement
      if (fast && h2 > 1e-6 && (gv - P.gv) / Math.sqrt(h2) < -SLIDE.launchSlope && atKickerLip(w, P.x, P.z, P.vx, P.vz)) {
        P.onGround = false;
        P.vy = Math.max(0, P.gv) + SLIDE.launchPop; // la montée qu'avait le sol (sommet d'une rampe) et un petit bond
        P.y = -dg;
        P.airT = 0;
        P.slideBuf = 0;
        P.coyote = SLIDE.coyote; // 1.31.2 : sauter juste après la crête reste un saut glissé
        P.slideJump = false; // envol : on décolle en glisse, la réception continue la glissade
        if (P.sliding) {
          P.sliding = false;
          P.airMom = true;
        } else {
          P.airMom = true;
          P.mvx = P.vx;
          P.mvz = P.vz;
        }
        w.emit(Ev.Launch, P.x, 0, P.z, Math.sqrt(P.mvx * P.mvx + P.mvz * P.mvz));
      }
      P.gv = gv;
    }
  }
  P.gPrev = g;
  const ground = 0; // y = hauteur au-dessus du sol local (le relief est ajouté par le rendu)
  if (!P.onGround) {
    P.vy -= PLAYER.gravity * (P.airMom && w.items[It.Plume] ? plumeGrav(w) : 1) * dt; // phase 28 : Plume
    P.y += P.vy * dt;
    P.airT += dt;
    if (P.y <= ground) {
      P.y = ground;
      P.vy = 0;
      P.onGround = true;
      w.emit(Ev.Land, P.x, ground, P.z, P.airT);
      if (w.trait === Trait.Demolisseur) placeMine(w, P.x, P.z); // Sapeur : une mine par atterrissage
      if (w.items[It.Bottes]) landingShockwave(w); // phase 17 : l'atterrissage repousse les ennemis proches
      // élan horizontal du vol : celui de la glissade (saut glissé, envol) ou la marche
      const hx = P.airMom ? P.mvx : P.vx,
        hz = P.airMom ? P.mvz : P.vz;
      if (P.slideBuf > 0) {
        // 1.30.1 : glisse appuyée juste avant de toucher le sol, on repart en glissade avec l'élan du vol
        P.slideBuf = 0;
        P.airMom = false;
        perfectSlide(w, hx, hz, walk, ix, iz, l);
      } else {
        P.landGrace = SLIDE.landPost; // un appui dans l'instant qui suit compte encore
        P.landMx = hx;
        P.landMz = hz;
      }
      // réception glissée : après un envol, l'élan continue au sol, droit dans le sens du vol ; après un saut glissé, on
      // se réceptionne debout (1.24.1 : le saut annule la glissade)
      if (!P.sliding && P.airMom && !P.slideJump && P.mvx * P.mvx + P.mvz * P.mvz > (walk * SLIDE.endMul) ** 2) {
        const m = Math.sqrt(P.mvx * P.mvx + P.mvz * P.mvz);
        P.dirX = P.mvx / m;
        P.dirZ = P.mvz / m;
        P.sliding = true;
        w.emit(Ev.SlideStart, P.x, 0, P.z, Math.sqrt(P.mvx * P.mvx + P.mvz * P.mvz));
      }
      P.airMom = false;
      P.slideJump = false;
      P.gv = 0;
    }
  }
  // vitesse lissée (≈ 0,5 s) : le Faucheur s'y règle
  const vNow = Math.sqrt((P.x - P.px) ** 2 + (P.z - P.pz) ** 2) / dt;
  P.spd += (vNow - P.spd) * Math.min(1, dt * SLIDE.spdSmooth);
  // phase 31 : Mousse de troll (part des PV max par seconde), Second souffle (bien plus sous un seuil de PV)
  let regen = P.regen;
  regen += P.maxHp * ITEM.mousse.pct * w.itemEff[It.Mousse]; // phase 38 : × exemplaires (0 sans l'objet)
  if (w.items[It.Souffle] && P.hp < P.maxHp * ITEM.souffle.below) regen += P.maxHp * ITEM.souffle.pct * w.itemEff[It.Souffle];
  P.hp = Math.min(P.maxHp, P.hp + regen * dt);
  healTick(w, dt);
  P.walk += l * dt * 12;
  // défi « Marathon » : distance réellement parcourue ; Feu follet : traînée de feu posée tous les TRAIT.trainee.spacing u de Comète
  const mx = P.x - P.px,
    mz = P.z - P.pz;
  const moved = Math.sqrt(mx * mx + mz * mz);
  w.distance += moved;
  if (P.sliding) w.slideDist += moved; // phase 28 : succès « Glisseur »
  if (P.dashT > 0 && w.trait === Trait.Trainee) {
    const S = w.wstate;
    S.fireDist += moved;
    if (S.fireDist >= TRAIT.trainee.spacing) {
      S.fireDist = 0;
      placeFire(w, P.x, P.z);
    }
  }
}

function stepEnemies(w: World, dt: number): void {
  const P = w.player;
  const decay = Math.pow(KNOCKBACK_DECAY, dt);
  let hurt = 0;
  const grid = w.grid;
  // en l'air : hors de portée du contact (phase 16 : sol plat, plus de plateaux)
  const airborne = P.y >= PLAYER.airborneSafeY;
  let shooters = 0;
  // Épines (phase 17) : le renvoi de dégâts tombe toutes les ITEM.epines.period s, pas à chaque pas (moins de chiffres)
  const sablier = w.items[It.Sablier] > 0; // Sablier fêlé : élites et boss ralentis (phase 38 : > 0, il se cumule)
  const slow = Math.max(ITEM.sablier.min, ITEM.sablier.slow ** w.itemEff[It.Sablier]);
  const frozen = w.powerT[Pw.Gel] > 0; // phase 35 : Temps figé
  let thorns = false;
  if (w.items[It.Epines]) {
    w.thornT -= dt;
    if (w.thornT <= 0) {
      w.thornT = ITEM.epines.period;
      thorns = true;
    }
  }
  for (let i = 0; i < w.enemyCount; i++) {
    const e = w.enemies[i];
    if (!e.alive) continue;
    const def = ENEMIES[e.type];
    if (e.type === ARCHER_TYPE || e.type === CRACHEUR_TYPE || e.type === SORCIER_TYPE) shooters++;
    e.px = e.x;
    e.pz = e.z;
    const dx = P.x - e.x,
      dz = P.z - e.z;
    const d2 = dx * dx + dz * dz;
    const d = d2 > 1e-8 ? Math.sqrt(d2) : 1;
    if (d > SPAWN.despawnDist && !def.boss) {
      respawnNear(w, i);
      continue;
    }
    // déplacement voulu selon le rôle ; phase 19 : un ennemi étourdi (Éclat, Collet) ne bouge ni n'agit ;
    // phase 35 : Temps figé, aucun ennemi ne bouge ni n'agit (boss compris)
    if (frozen) {
      mv[0] = mv[1] = 0;
    } else if (e.stun > 0) {
      e.stun -= dt;
      mv[0] = mv[1] = 0;
    } else if (def.boss) tickBoss(w, e, dt, dx, dz, d, mv);
    else if (isCharger(e)) tickCharger(w, e, dt, dx, dz, d, mv);
    else if (e.type === VOLANT_TYPE) tickFlyer(w, e, dt, dx, dz, d, mv);
    else if (e.type === CRACHEUR_TYPE) tickSpitter(w, e, dt, dx, dz, d, mv);
    else if (e.type === ARCHER_TYPE) tickArcher(w, e, dt, dx, dz, d, mv);
    else if (e.type === SORCIER_TYPE) tickSorcier(w, e, dt, dx, dz, d, mv);
    else {
      const sp = def.speed * e.spd;
      mv[0] = (dx / d) * sp;
      mv[1] = (dz / d) * sp;
    }
    const flies = ignoresGround(e.type);
    // phase 16 : un marcheur qui avance vers le joueur suit le champ de flux (il trouve la brèche d'un muret) ;
    // les boss, eux, passent à travers les ouvrages et n'en ont pas besoin
    if (!flies && !def.boss && !(isCharger(e) && e.state === 2)) {
      const mvx = mv[0],
        mvz = mv[1],
        sp2 = mvx * mvx + mvz * mvz;
      if (sp2 > 1e-8 && mvx * dx + mvz * dz > 0) {
        w.flow.steer(e.x, e.z, dx / d, dz / d, fl, e.detour > 0);
        const sp = Math.sqrt(sp2);
        mv[0] = fl[0] * sp;
        mv[1] = fl[1] * sp;
      }
    }
    // phase 17 : Sablier fêlé, élites et boss ralentis
    if (sablier && (e.elite || def.boss)) {
      mv[0] *= slow;
      mv[1] *= slow;
    }
    // phase 19 : ralenti par un sort (Voile ; boss dans un Collet ou un Éclat)
    if (e.slowT > 0) {
      e.slowT -= dt;
      mv[0] *= SPELL.slow;
      mv[1] *= SPELL.slow;
    }
    let mx = mv[0],
      mz = mv[1];
    if (!flies) {
      const slow = w.speedAt(e.x, e.z) * w.slopeMul(e.x, e.z, mx, mz); // lac et pente (phase 18)
      mx *= slow;
      mz *= slow;
      if (!def.boss && e.stun <= 0 && !frozen) {
        // séparation avec les voisins (9 cellules) ; phase 19 : un ennemi étourdi reste planté (Collet)
        const nn = grid.neighbors(i, nb);
        for (let k = 0; k < nn; k++) {
          const o = w.enemies[nb[k]];
          if (!o.alive || ignoresGround(o.type)) continue;
          const sx = e.x - o.x,
            sz = e.z - o.z,
            rr = e.r + o.r,
            dd = sx * sx + sz * sz;
          if (dd < rr * rr && dd > 1e-6) {
            const dl = Math.sqrt(dd),
              push = ((rr - dl) / rr) * ENEMY_SEPARATION;
            mx += (sx / dl) * push;
            mz += (sz / dl) * push;
          }
        }
      }
    }
    e.x += (mx + e.kx) * dt;
    e.z += (mz + e.kz) * dt;
    e.kx *= decay;
    e.kz *= decay;
    if (e.detour > 0) e.detour -= dt;
    if (!flies && !def.boss && w.nearObstacle(e.x, e.z)) {
      // phase 16 : les marcheurs butent sur tous les obstacles (le champ de flux les a déjà orientés vers un passage) ;
      // s'ils n'avancent presque plus, ils suivent le flux case par case un moment (ils glissent autour)
      w.resolveObstacles(e.x, e.z, e.r, out2, 0);
      const want = (mx * mx + mz * mz) * dt * dt,
        gx = out2[0] - e.px,
        gz = out2[1] - e.pz;
      if (want > 1e-6 && gx * gx + gz * gz < want * FLOW.blocked * FLOW.blocked) e.detour = FLOW.detour;
      e.x = out2[0];
      e.z = out2[1];
    }
    if (!frozen) e.face = Math.atan2(dx, dz); // phase 35 : un ennemi figé ne suit plus le héros des yeux
    if (e.flash > 0) e.flash -= dt;
    // contact : jamais sur un joueur en l'air ; le Volant ne blesse qu'en plongée (state 2)
    // phase 19 : un ennemi étourdi (Éclat, Collet) ne blesse pas : une Brute figée en pleine charge ne la porte pas
    const canHurt = e.stun > 0 || frozen ? false : e.type === VOLANT_TYPE ? e.state === 2 : true;
    // phase 34 : Revenante, frisson du tombeau — les ennemis proches d'elle sont ralentis
    if (w.trait === Trait.DejaMorte && d < TRAIT.dejamorte.chillR && !airborne) e.slowT = Math.max(e.slowT, TRAIT.dejamorte.chill);
    if (canHurt && d < e.r + PLAYER.radius && !airborne && P.invul <= 0) {
      if (e.state === 2 && isCharger(e)) {
        // charge encaissée : un coup sec, puis la Brute s'essouffle ; brève invulnérabilité (pas de double peine)
        const dmg = HAZARDS.charge.dmg * e.dmgMul * (1 - P.armor) * P.dmgTaken;
        P.hp -= dmg;
        hurt += dmg;
        P.invul = Math.max(P.invul, HAZARDS.charge.invul);
        e.state = 3;
        e.timer = HAZARDS.charge.recover;
        w.lastHurt = HurtSrc.Charge;
      } else {
        // phase 17 : Rempart (Vitalité + Halo), le contact d'un ennemi dans le Halo est réduit
        const inHalo = w.syn[Syn.Rempart] && d < w.wstats.aura.r;
        const dmg = def.dmg * e.dmgMul * dt * (1 - P.armor) * P.dmgTaken * (inHalo ? SYN.rempart.dmgTaken : 1);
        P.hp -= dmg;
        hurt += dmg;
        w.lastHurt = HurtSrc.Contact;
        // phase 17 : Épines, le contact est renvoyé (par paquets, toutes les ITEM.epines.period s)
        if (thorns) hitEnemy(w, i, def.dmg * e.dmgMul * ITEM.epines.period * ITEM.epines.mul * w.itemEff[It.Epines], 0, P.x, P.z, HitSrc.Thorns);
      }
    }
  }
  w.shooters = shooters;
  if (hurt > 0 && !shieldAbsorb(w, hurt)) {
    w.lastAction = w.t;
    w.hurtAt = w.t;
    w.emit(Ev.PlayerHurt, P.x, P.y + 1, P.z, hurt);
  }
}

/** Projectiles ennemis : crachats (mobiles) et cercles du Colosse (immobiles, explosent à la fin). */
function tickShots(w: World, dt: number): void {
  const P = w.player;
  const airborne = P.y >= PLAYER.airborneSafeY;
  let hurt = 0;
  for (let i = w.shotCount - 1; i >= 0; i--) {
    const s = w.shots[i];
    s.px = s.x;
    s.pz = s.z;
    s.x += s.vx * dt;
    s.z += s.vz * dt;
    s.life -= dt;
    const dx = P.x - s.x,
      dz = P.z - s.z,
      rr = s.r + PLAYER.radius;
    const inside = dx * dx + dz * dz < rr * rr;
    if (s.kind === ShotKind.Spit || s.kind === ShotKind.Arrow) {
      // tirs droits : le crachat (au sol) se saute, la flèche non ; les deux s'arrêtent sur un obstacle (phase 16)
      const arrow = s.kind === ShotKind.Arrow;
      if (inside && (arrow || !airborne) && P.invul <= 0) {
        P.hp -= s.dmg * (1 - P.armor) * P.dmgTaken;
        hurt += s.dmg * (1 - P.armor) * P.dmgTaken;
        w.lastHurt = arrow ? HurtSrc.Arrow : HurtSrc.Spit;
        w.freeShot(i);
        continue;
      }
      if (w.nearObstacle(s.x, s.z) && w.blocksShot(s.x, s.z, s.r)) {
        w.emit(Ev.ShotBlocked, s.x, arrow ? 1 : 0.3, s.z, s.kind);
        w.freeShot(i);
        continue;
      }
      if (s.life <= 0) w.freeShot(i);
    } else if (s.kind === ShotKind.Ring) {
      // onde de choc : le rayon grandit, blesse une fois au passage de l'anneau (au sol)
      s.r += HAZARDS.ring.speed * dt;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (!s.hit && Math.abs(dist - s.r) < HAZARDS.ring.width * 0.5 + PLAYER.radius && !airborne && P.invul <= 0) {
        P.hp -= s.dmg * (1 - P.armor) * P.dmgTaken;
        hurt += s.dmg * (1 - P.armor) * P.dmgTaken;
        s.hit = true;
        w.lastHurt = HurtSrc.Ring;
      }
      if (s.life <= 0) w.freeShot(i);
    } else if (s.kind === ShotKind.Eruption) {
      // 1.25.1 : le cercle reste où il est apparu (sous le joueur) ; on en sort, on le saute ou on le dashe
      if (s.life <= 0) {
        // pic : blesse et projette le joueur au sol
        w.emit(Ev.Eruption, s.x, 0, s.z, s.r);
        if (inside && !airborne && P.invul <= 0) {
          P.hp -= s.dmg * (1 - P.armor) * P.dmgTaken;
          hurt += s.dmg * (1 - P.armor) * P.dmgTaken;
          P.vy = HAZARDS.eruption.launch;
          P.onGround = false;
          w.lastHurt = HurtSrc.Eruption;
        }
        w.freeShot(i);
      }
    } else if (s.life <= 0) {
      // zone du Colosse ou boule de feu du Sorcier (phase 16) : explose ; un joueur en l'air y échappe
      w.emit(Ev.ZoneBlast, s.x, 0, s.z, s.r);
      if (inside && !airborne && P.invul <= 0) {
        P.hp -= s.dmg * (1 - P.armor) * P.dmgTaken;
        hurt += s.dmg * (1 - P.armor) * P.dmgTaken;
        w.lastHurt = s.kind === ShotKind.Fireball ? HurtSrc.Fire : HurtSrc.Zone;
      }
      w.freeShot(i);
    }
  }
  if (hurt > 0 && !shieldAbsorb(w, hurt)) {
    w.lastAction = w.t;
    w.hurtAt = w.t;
    w.emit(Ev.PlayerHurt, P.x, P.y + 1, P.z, hurt);
  }
}
