import { useQuery } from "@tanstack/react-query";

import { CENTRE_EMBLEM_SRC } from "@/assets/letterhead/emblem";
import { useUploadSrc } from "@/lib/use-upload-src";
import { getCurrentAdminBranding } from "@/server/branding";

/**
 * The centre's logo and name, ready for an `<img>`: the logo stored in
 * Settings › عام (`centre.logoUrl`), or the emblem cut from his letterhead
 * (`CENTRE_EMBLEM_SRC`) while none is stored.
 *
 *     const logo = useCentreLogo();
 *     <img src={logo.src} alt={logo.name} />
 *
 * A printed sheet is a pure picture of its data: the page reads this and
 * passes `logo.src` to the sheet.
 */
export function useCentreLogo(): { src: string; name: string; isDefault: boolean } {
  const { data } = useQuery({ queryKey: ["branding"], queryFn: getCurrentAdminBranding });
  const stored = useUploadSrc(data?.logoUrl);
  return { src: stored ?? CENTRE_EMBLEM_SRC, name: data?.academyName ?? "", isDefault: !data?.logoUrl };
}
