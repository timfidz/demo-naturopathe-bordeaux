// Comportements du site : en-tête, menu mobile, module de réservation de démonstration
// Sur le vrai site, la réservation est l'outil choisi (Cal.com) relié à l'agenda de la praticienne ; ici tout reste dans le navigateur.
(function () {
  "use strict";

  const entete = document.querySelector(".entete");
  const majEntete = () => entete && entete.classList.toggle("defile", window.scrollY > 8);
  window.addEventListener("scroll", majEntete, { passive: true });
  majEntete();

  const boutonMenu = document.querySelector(".bouton-menu");
  const nav = document.querySelector(".nav");
  if (boutonMenu && nav) {
    boutonMenu.addEventListener("click", () => {
      const ouvert = nav.classList.toggle("ouvert");
      boutonMenu.setAttribute("aria-expanded", String(ouvert));
    });
  }

  const racine = document.getElementById("resa");
  if (!racine) return;

  // ============ Données
  const CONSULTATIONS = JSON.parse(document.getElementById("consultations").textContent);
  // Horaires d'ouverture par jour de la semaine (0 = dimanche), en minutes depuis minuit
  const HORAIRES = {
    2: [[9 * 60, 12 * 60 + 30], [14 * 60, 19 * 60]],
    3: [[9 * 60, 12 * 60 + 30], [14 * 60, 19 * 60]],
    4: [[9 * 60, 12 * 60 + 30], [14 * 60, 19 * 60]],
    5: [[9 * 60, 12 * 60 + 30], [14 * 60, 18 * 60]],
    6: [[9 * 60, 13 * 60]],
  }
  const PAUSE = 15 // minutes entre deux consultations
  const PAS = 30 // un départ possible toutes les 30 minutes
  const NB_JOURS = 21
  const CLE = "demo-naturo-rdv"

  const JOURS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."]
  const JOURS_LONGS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"]
  const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
  const MOIS_COURTS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."]
  const heure = (m) => `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`.replace(" h 00", " h")
  const cleJour = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  const dateLongue = (d) => `${JOURS_LONGS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`

  // Rendez-vous déjà pris : tirés d'une graine par jour, pour que l'agenda reste le même d'une visite à l'autre
  function graine(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) } return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296 } }
  function occupes(jour) {
    const plages = HORAIRES[jour.getDay()] || []
    const alea = graine(cleJour(jour))
    const pris = []
    for (const [debut, fin] of plages) {
      let t = debut
      while (t + 60 <= fin) {
        const duree = alea() < .5 ? 60 : 90
        if (alea() < .22 && t + duree <= fin) { pris.push([t, t + duree]); t += duree + PAUSE }
        else t += PAS
      }
    }
    return pris.concat(lireResas().filter((r) => r.jour === cleJour(jour)).map((r) => [r.debut, r.debut + r.duree]))
  }
  function creneaux(jour, duree) {
    const plages = HORAIRES[jour.getDay()] || []
    const pris = occupes(jour)
    const libres = []
    for (const [debut, fin] of plages) {
      for (let t = debut; t + duree <= fin; t += PAS) {
        // Libre si la consultation et la pause qui la suit ne chevauchent aucun rendez-vous (lui-même suivi de sa pause)
        const conflit = pris.some(([a, b]) => t < b + PAUSE && a < t + duree + PAUSE)
        if (!conflit) libres.push(t)
      }
    }
    return libres
  }
  function lireResas() { try { return JSON.parse(localStorage.getItem(CLE)) || [] } catch { return [] } }
  function ecrireResas(l) { try { localStorage.setItem(CLE, JSON.stringify(l)) } catch {} }

  // ============ État et affichage
  const etat = { consultation: null, jour: null, debut: null }
  const etapes = [...racine.querySelectorAll(".resa-etape")]
  const progression = [...racine.querySelectorAll(".resa-progression li")]
  function allerA(n) {
    etapes.forEach((e, i) => (e.hidden = i !== n))
    progression.forEach((p, i) => p.classList.toggle("fait", i <= n))
    if (n === 1) dessinerJours()
    if (n === 2) dessinerRecap()
    const titre = etapes[n].querySelector("h2")
    if (titre && etat.dejaAffiche) { titre.setAttribute("tabindex", "-1"); titre.focus({ preventScroll: true }); racine.scrollIntoView({ behavior: "smooth", block: "start" }) }
    etat.dejaAffiche = true
  }

  // Étape 1 : la consultation
  const listeConsult = racine.querySelector("#choix-consultation")
  listeConsult.innerHTML = CONSULTATIONS.map((c) => `<button type="button" data-id="${c.id}" aria-pressed="false"><strong>${c.nom}</strong><span class="prix-choix">${c.prix} €</span><small>${c.duree === 90 ? "1 h 30" : c.duree === 60 ? "1 h" : c.duree + " min"} · ${c.lieu}</small></button>`).join("")
  listeConsult.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return
    etat.consultation = CONSULTATIONS.find((c) => c.id === b.dataset.id)
    etat.jour = null; etat.debut = null
    allerA(1)
  })

  // Étape 2 : le jour puis l'heure
  const listeJours = racine.querySelector("#jours")
  const listeCreneaux = racine.querySelector("#creneaux")
  function joursProposes() {
    const l = []
    const d = new Date(); d.setHours(0, 0, 0, 0)
    for (let i = 1; i <= NB_JOURS; i++) { const j = new Date(d); j.setDate(d.getDate() + i); l.push(j) }
    return l
  }
  function dessinerJours() {
    racine.querySelector("#consultation-choisie").textContent = `${etat.consultation.nom} · ${etat.consultation.duree === 90 ? "1 h 30" : etat.consultation.duree === 60 ? "1 h" : etat.consultation.duree + " min"}`
    const jours = joursProposes()
    listeJours.innerHTML = jours.map((j) => {
      const n = creneaux(j, etat.consultation.duree).length
      const choisi = etat.jour && cleJour(etat.jour) === cleJour(j)
      return `<button type="button" data-jour="${cleJour(j)}" aria-pressed="${choisi}" ${n ? "" : "disabled"} aria-label="${dateLongue(j)}${n ? `, ${n} créneaux` : ", complet ou fermé"}"><small>${JOURS[j.getDay()]}</small><strong>${j.getDate()}</strong><small>${MOIS_COURTS[j.getMonth()]}</small></button>`
    }).join("")
    if (!etat.jour) { const premier = jours.find((j) => creneaux(j, etat.consultation.duree).length); etat.jour = premier }
    marquerJour(); dessinerCreneaux()
  }
  function marquerJour() { listeJours.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(etat.jour && b.dataset.jour === cleJour(etat.jour)))) }
  function dessinerCreneaux() {
    racine.querySelector("#jour-choisi").textContent = etat.jour ? dateLongue(etat.jour) : ""
    const l = etat.jour ? creneaux(etat.jour, etat.consultation.duree) : []
    listeCreneaux.innerHTML = l.length
      ? l.map((t) => `<button type="button" data-debut="${t}" aria-pressed="${etat.debut === t}">${heure(t)}</button>`).join("")
      : `<p class="vide">Plus de créneau ce jour-là.</p>`
  }
  listeJours.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b || b.disabled) return
    const [a, m, j] = b.dataset.jour.split("-").map(Number)
    etat.jour = new Date(a, m - 1, j); etat.debut = null
    marquerJour(); dessinerCreneaux()
  })
  listeCreneaux.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return
    etat.debut = Number(b.dataset.debut)
    allerA(2)
  })

  // Étape 3 : les coordonnées
  function dessinerRecap() {
    racine.querySelector("#recap").innerHTML = `<strong>${etat.consultation.nom}</strong> (${etat.consultation.prix} €)<br>${dateLongue(etat.jour)} à ${heure(etat.debut)} · ${etat.consultation.lieu}`
  }
  const formulaire = racine.querySelector("#form-resa")
  formulaire.addEventListener("submit", (e) => {
    e.preventDefault()
    if (!formulaire.reportValidity()) return
    const donnees = Object.fromEntries(new FormData(formulaire))
    // Le créneau a pu être pris entre-temps (autre onglet) : on revérifie avant d'enregistrer
    if (!creneaux(etat.jour, etat.consultation.duree).includes(etat.debut)) { alert("Ce créneau vient d'être pris. Choisissez-en un autre."); allerA(1); return }
    ecrireResas(lireResas().concat({ jour: cleJour(etat.jour), debut: etat.debut, duree: etat.consultation.duree }))
    const quand = `${dateLongue(etat.jour)} à ${heure(etat.debut)}`
    const prenom = String(donnees.prenom).trim()
    racine.querySelector("#confirmation-texte").textContent = `${prenom}, votre ${etat.consultation.nom.toLowerCase()} est réservé${etat.consultation.feminin ? "e" : ""} le ${quand}.`
    racine.querySelector("#mail-client").innerHTML = `<div class="entete-mail">À : ${escape(String(donnees.email))} · Objet : Votre rendez-vous du ${quand}</div>
      <p>Bonjour ${escape(prenom)},</p><p>Votre rendez-vous est confirmé : <strong>${etat.consultation.nom}</strong>, le ${quand}, ${etat.consultation.lieu === "En visio" ? "en visio (le lien vous arrive la veille)" : "au cabinet, quartier des Chartrons à Bordeaux (tram B)"}.</p>
      <p>${etat.consultation.duree === 90 ? "Pour ce premier rendez-vous, apportez si possible vos dernières analyses de sang. " : ""}Un empêchement ? Le lien en bas de ce message permet d'annuler ou de déplacer jusqu'à 48 h avant.</p><p>À bientôt,<br>Claire Delmas</p>`
    racine.querySelector("#mail-pro").innerHTML = `<div class="entete-mail">Ajouté à votre agenda · ${quand}</div>
      <p><strong>${escape(prenom)} ${escape(String(donnees.nom || ""))}</strong> · ${etat.consultation.nom}${donnees.premiere ? " · première consultation" : ""}<br>${escape(String(donnees.telephone || ""))}${donnees.message ? `<br>« ${escape(String(donnees.message))} »` : ""}</p>`
    formulaire.reset()
    allerA(3)
  })
  function escape(s) { return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]) }

  racine.querySelectorAll("[data-retour]").forEach((b) => b.addEventListener("click", () => allerA(Number(b.dataset.retour))))
  racine.querySelector("#recommencer").addEventListener("click", () => { etat.consultation = null; etat.jour = null; etat.debut = null; allerA(0) })

  // Arrivée depuis la page des tarifs : la consultation est déjà choisie
  const demandee = new URLSearchParams(location.search).get("consultation")
  const trouvee = CONSULTATIONS.find((c) => c.id === demandee)
  if (trouvee) { etat.consultation = trouvee; allerA(1) } else allerA(0)
})()
