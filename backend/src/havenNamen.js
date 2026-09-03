// 2026-09-03, op verzoek van Lex (telling op live data: 9% van de schepen
// zendt een LOCODE uit, 85% vrije tekst als "ROTTERDAM", "AMSTERDAM
// AMERIKAHAV", "ANTWERPEN 4E HAVENDO", "URK") -- aanvulling op de
// UN/LOCODE-tabel (unlocodeHavens.json) voor de reisvoortgang, zie
// reisvoortgang.js.
//
// Twee delen:
//   1. AANVULLINGEN: LOCODEs die in de UNECE-lijst WEL bestaan maar zonder
//      coördinaat (veel Nederlandse binnenhavens: NLURK, NLNIJ, NLGRQ...),
//      plus enkele die er niet in staan. Coördinaten handmatig ingevuld op
//      het havengebied, nauwkeurigheid ~1 km -- ruim voldoende voor een
//      voortgangsschatting over tientallen km, NIET bedoeld als navigatie.
//   2. ALIASSEN: vrije-tekstnamen en havenbekkens -> LOCODE. Rotterdamse/
//      Amsterdamse/Antwerpse bekkens wijzen naar een eigen punt waar dat
//      zinvol afwijkt van de stadscode (Maasvlakte ligt 30 km van "NLRTM").
//
// Matching (zie zoekHavenOpNaam()): hele tekst, dan de eerste twee woorden,
// dan het eerste woord -- zo landt "ROTTERDAM 3E PETROHA" op Rotterdam en
// "AMSTERDAM AMERIKAHAV" op de Amerikahaven. Namen korter dan 4 tekens
// worden niet los gematcht (te veel toevalstreffers).
export const AANVULLINGEN = {
  // Nederland -- Rijnmond/Rotterdam-bekkens
  NLEUR: [51.95, 4.15, 'Europoort'],
  NLMSV: [51.95, 4.03, 'Maasvlakte'],
  NLSPI: [51.86, 4.33, 'Spijkenisse'],
  NLSCI: [51.9, 4.4, 'Schiedam'],
  NLVLA: [51.9, 4.34, 'Vlaardingen'],
  NLMSL: [51.91, 4.25, 'Maassluis'],
  NLHSL: [51.82, 4.13, 'Hellevoetsluis'],
  NLOBL: [51.83, 4.41, 'Oud-Beijerland'],
  NLABL: [51.87, 4.66, 'Alblasserdam'],
  NLPAP: [51.83, 4.69, 'Papendrecht'],
  NLZWI: [51.82, 4.63, 'Zwijndrecht'],
  NLWKD: [51.81, 4.89, 'Werkendam'],
  NLGOR: [51.83, 4.97, 'Gorinchem'],
  NLWIS: [51.69, 4.44, 'Willemstad'],
  NLSTD: [51.83, 4.05, 'Stellendam'],
  NLMIH: [51.76, 4.17, 'Middelharnis'],
  // Zeeland
  NLBSE: [51.66, 4.09, 'Bruinisse'],
  NLZIE: [51.64, 3.92, 'Zierikzee'],
  NLGOE: [51.51, 3.89, 'Goes'],
  NLYSK: [51.5, 4.05, 'Yerseke'],
  // Noord-Holland / IJsselmeer / Waddenzee
  NLVEL: [52.46, 4.63, 'Velsen'],
  NLBEV: [52.48, 4.66, 'Beverwijk'],
  NLZAA: [52.44, 4.82, 'Zaandam'],
  NLHAA: [52.39, 4.64, 'Haarlem'],
  NLHRN: [52.64, 5.06, 'Hoorn'],
  NLENK: [52.7, 5.29, 'Enkhuizen'],
  NLURK: [52.66, 5.6, 'Urk'],
  NLLEY: [52.52, 5.44, 'Lelystad'],
  NLLMR: [52.84, 5.71, 'Lemmer'],
  NLTEX: [53.04, 4.85, 'Texel (Oudeschild)'],
  NLVLL: [53.3, 5.09, 'Vlieland'],
  NLAML: [53.44, 5.77, 'Ameland (Nes)'],
  NLDOV: [52.93, 5.03, 'Den Oever'],
  // Noorden
  NLEEM: [53.45, 6.83, 'Eemshaven'],
  NLLAN: [53.41, 6.2, 'Lauwersoog'],
  NLGRQ: [53.22, 6.57, 'Groningen'],
  NLLWR: [53.2, 5.79, 'Leeuwarden'],
  NLSNK: [53.03, 5.66, 'Sneek'],
  NLHRV: [52.96, 5.92, 'Heerenveen'],
  NLDRA: [53.11, 6.08, 'Drachten'],
  NLMEP: [52.7, 6.19, 'Meppel'],
  NLKAM: [52.56, 5.91, 'Kampen'],
  NLZWO: [52.52, 6.09, 'Zwolle'],
  NLDEV: [52.25, 6.15, 'Deventer'],
  // Rivieren / oosten / zuiden
  NLARN: [51.97, 5.9, 'Arnhem'],
  NLNIJ: [51.85, 5.85, 'Nijmegen'],
  NLTIE: [51.89, 5.43, 'Tiel'],
  NLZLB: [51.81, 5.25, 'Zaltbommel'],
  NLHDL: [51.75, 5.27, 'Hedel'],
  NLGOU: [52.01, 4.71, 'Gouda'],
  NLDFT: [52.01, 4.36, 'Delft'],
  NLWSP: [52.31, 5.04, 'Weesp'],
  NLMST: [50.85, 5.7, 'Maastricht'],
  NLOMD: [51.19, 5.98, 'Roermond'],
  // België / Duitsland / overig
  BEKOU: [51.25, 4.28, 'Kallo'],
  DEMAI: [50.0, 8.28, 'Mainz'],
  DEBON: [50.73, 7.1, 'Bonn'],
  DEKOB: [50.36, 7.6, 'Koblenz'],
  DEKAE: [49.02, 8.32, 'Karlsruhe'],
  DEBRE: [53.11, 8.75, 'Bremen'],
  DELEE: [53.23, 7.45, 'Leer'],
  CHBSL: [47.58, 7.59, 'Basel'],
  // Havenbekkens met een eigen punt (pseudo-codes, alleen intern gebruikt)
  NLRT1: [51.88, 4.3, 'Rotterdam Botlek'],
  NLRT2: [51.89, 4.43, 'Rotterdam Waalhaven'],
  NLRT3: [51.895, 4.44, 'Rotterdam Eemhaven'],
  NLRT4: [51.95, 4.1, 'Rotterdam Calandkanaal'],
  NLRT5: [51.94, 4.09, 'Rotterdam Dintelhaven'],
  NLRT6: [51.9, 4.41, 'Rotterdam Merwehaven'],
  NLAM1: [52.41, 4.78, 'Amsterdam Amerikahaven'],
  NLAM2: [52.42, 4.74, 'Amsterdam Afrikahaven'],
  NLAM3: [52.4, 4.83, 'Amsterdam Westhaven'],
  BEAN1: [51.28, 4.33, 'Antwerpen havendokken'],
};

// Vrije tekst (genormaliseerd: hoofdletters, één spatie) -> LOCODE.
export const ALIASSEN = {
  ANTWERP: 'BEANR', ANVERS: 'BEANR', ANTWERPEN: 'BEANR',
  GHENT: 'BEGNE', GAND: 'BEGNE',
  KOELN: 'DECGN', COLOGNE: 'DECGN',
  LUIK: 'BELGG',
  DUESSELDORF: 'DEDUS',
  'HOEK VAN HOLLAND': 'NLRTM', HVH: 'NLRTM',
  BOTLEK: 'NLRT1', 'ROTTERDAM BOTLEK': 'NLRT1', PETROLEUMHAVEN: 'NLRT1', 'ROTTERDAM PETROLEUMHAVEN': 'NLRT1',
  WAALHAVEN: 'NLRT2', 'ROTTERDAM WAALHAVEN': 'NLRT2',
  EEMHAVEN: 'NLRT3', 'ROTTERDAM EEMHAVEN': 'NLRT3',
  CALANDKANAAL: 'NLRT4', 'ROTTERDAM CALANDKANAAL': 'NLRT4',
  DINTELHAVEN: 'NLRT5', 'ROTTERDAM DINTELHAVEN': 'NLRT5',
  MERWEHAVEN: 'NLRT6', 'ROTTERDAM MERWEHAVEN': 'NLRT6',
  EUROPOORT: 'NLEUR', 'ROTTERDAM EUROPOORT': 'NLEUR',
  MAASVLAKTE: 'NLMSV', 'ROTTERDAM MAASVLAKTE': 'NLMSV', MV2: 'NLMSV',
  PERNIS: 'NLPER', 'ROTTERDAM PERNIS': 'NLPER',
  AMERIKAHAVEN: 'NLAM1', 'AMSTERDAM AMERIKAHAVEN': 'NLAM1',
  AFRIKAHAVEN: 'NLAM2', 'AMSTERDAM AFRIKAHAVEN': 'NLAM2',
  WESTHAVEN: 'NLAM3', 'AMSTERDAM WESTHAVEN': 'NLAM3',
  'DEN OEVER': 'NLDOV',
  'DEN HELDER': 'NLDHR',
  KALLO: 'BEKOU',
};
