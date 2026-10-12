/**
 * The communes of the wilaya of أم البواقي (04): the rows `Commune` is seeded
 * with, in the order of their official codes.
 *
 * Checked on 2026-10-12 by the coordinator against the 2008 census list with
 * its official codes (citypopulation.de, Algeria, Oum El Bouaghi), the French
 * Wikipedia page of the wilaya (the same 29 French names) and the Arabic one.
 * One name was corrected: «الراحية», as both the census and Arabic Wikipedia
 * write it. Where the census differs on the others it is an older spelling of
 * the same name (ى for a final ي, «عين الفكرون», «أولاد الزوى», «هنشير
 * تومغانى», «الفجوج ب س»); the forms below are the ones in common use.
 *
 * `Commune` has no column for the official code: a seeded commune's id is
 * `commune-<code>` (`commune-0425` is عين فكرون). The office can add a commune
 * from any address field; it then gets an ordinary id.
 */
export interface SeedCommune {
  /** The official commune code: the wilaya's two digits, then the commune's. */
  code: string;
  nameAr: string;
  nameFr: string;
}

export const COMMUNES_OUM_EL_BOUAGHI: readonly SeedCommune[] = [
  { code: "0401", nameAr: "أم البواقي", nameFr: "Oum El Bouaghi" },
  { code: "0402", nameAr: "عين البيضاء", nameFr: "Aïn Beïda" },
  { code: "0403", nameAr: "عين مليلة", nameFr: "Aïn M'lila" },
  { code: "0404", nameAr: "بحير الشرقي", nameFr: "Behir Chergui" },
  { code: "0405", nameAr: "العامرية", nameFr: "El Amiria" },
  { code: "0406", nameAr: "سيقوس", nameFr: "Sigus" },
  { code: "0407", nameAr: "البلالة", nameFr: "El Belala" },
  { code: "0408", nameAr: "عين ببوش", nameFr: "Aïn Babouche" },
  { code: "0409", nameAr: "بريش", nameFr: "Berriche" },
  { code: "0410", nameAr: "أولاد حملة", nameFr: "Ouled Hamla" },
  { code: "0411", nameAr: "الضلعة", nameFr: "Dhalaa" },
  { code: "0412", nameAr: "عين كرشة", nameFr: "Aïn Kercha" },
  { code: "0413", nameAr: "هنشير تومغني", nameFr: "Hanchir Toumghani" },
  { code: "0414", nameAr: "الجازية", nameFr: "El Djazia" },
  { code: "0415", nameAr: "عين الديس", nameFr: "Aïn Diss" },
  { code: "0416", nameAr: "فكيرينة", nameFr: "Fkirina" },
  { code: "0417", nameAr: "سوق نعمان", nameFr: "Souk Naamane" },
  { code: "0418", nameAr: "الزرق", nameFr: "Zorg" },
  { code: "0419", nameAr: "الفجوج بوغرارة سعودي", nameFr: "El Fedjoudj Boughrara Saoudi" },
  { code: "0420", nameAr: "أولاد زواي", nameFr: "Ouled Zouaï" },
  { code: "0421", nameAr: "بئر الشهداء", nameFr: "Bir Chouhada" },
  { code: "0422", nameAr: "قصر الصباحي", nameFr: "Ksar Sbahi" },
  { code: "0423", nameAr: "وادي نيني", nameFr: "Oued Nini" },
  { code: "0424", nameAr: "مسكيانة", nameFr: "Meskiana" },
  { code: "0425", nameAr: "عين فكرون", nameFr: "Aïn Fakroun" },
  { code: "0426", nameAr: "الراحية", nameFr: "Rahia" },
  { code: "0427", nameAr: "عين الزيتون", nameFr: "Aïn Zitoun" },
  { code: "0428", nameAr: "أولاد قاسم", nameFr: "Ouled Gacem" },
  { code: "0429", nameAr: "الحرملية", nameFr: "El Harmilia" },
];

/** The id a seeded commune has in the database. */
export const seededCommuneId = (code: string) => `commune-${code}`;
