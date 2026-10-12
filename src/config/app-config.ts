import packageJson from "../../package.json";

const currentYear = new Date().getFullYear();

export const APP_CONFIG = {
  name: "مركز إنماء برو",
  version: packageJson.version,
  copyright: `© ${currentYear}, مركز إنماء برو.`,
  meta: {
    title: "مركز إنماء برو",
    description: "برنامج تسيير مركز إنماء برو: الموظفون، عمال النظافة، طلبات الخدمة، المصاريف والمخزون.",
  },
};
