/**
 * The kinds of record this folder stores files for, and the kinds of file.
 *
 * A stored file lives at uploads/<entity>/<field>/<name>. Add a name here
 * before saving a file under it; `saveManagedUpload` accepts nothing else.
 */
export const uploadEntities = ["admins"] as const;
export const uploadFields = ["logo"] as const;
