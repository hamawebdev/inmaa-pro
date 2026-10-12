import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import { ListPlus } from "lucide-react";
import { useParams } from "react-router-dom";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { ErrorState } from "@/components/error-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fileTasksPath, getFileTasksQuery } from "@/features/operations/services/file-tasks";
import { pathKey } from "@/lib/compat/revalidate";
import { fileHubHref } from "@/navigation/file-parts";

import { FileTasksBoard } from "./_components/file-tasks-board";
import { TaskDialog, type TaskDialogTarget } from "./_components/task-dialog";

/**
 * A file's part «المهام» (#13): what the team does on the site and how often,
 * for the whole site or for one place of it, and the places themselves.
 *
 * Closest academy screen: the programs list of the classes section
 * (pages/dashboard/edu-programs: a card of items with add and edit in a
 * dialog and a confirmed delete), with the row menu of the academy's lists
 * (employees/_components/employees-table.tsx: edit, activate or deactivate,
 * delete) and the add-from-a-list dialog of the group page
 * (groups/[groupId]/_components/add-student-dialog.tsx). Drawn with the newer
 * generation's cards, badges and chips. A part is a detail page: it has a back
 * action to the file, not a tab strip.
 */
export default function FileTasksPage() {
  const { id = "" } = useParams();
  const tNav = useTranslations("Nav");
  const t = useTranslations("FileTasks");
  const [taskTarget, setTaskTarget] = React.useState<TaskDialogTarget | null>(null);

  const query = useQuery({
    queryKey: pathKey(fileTasksPath(id)),
    queryFn: () => getFileTasksQuery({ fileId: id }),
  });
  const view = query.data;

  return (
    <DetailScreen
      section="requests"
      title={tNav("FilePartTasks")}
      back={{ href: fileHubHref(id), label: tNav("FileHub") }}
      actions={
        view?.editable ? (
          <Button variant="add" onClick={() => setTaskTarget({ mode: "new", areaId: null })}>
            <ListPlus />
            {t("AddTask")}
          </Button>
        ) : undefined
      }
    >
      {query.isError ? (
        <ErrorState onRetry={() => void query.refetch()} />
      ) : !view ? (
        <div className="space-y-6">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <FileTasksBoard fileId={id} view={view} onTask={setTaskTarget} />
          <TaskDialog fileId={id} view={view} target={taskTarget} onClose={() => setTaskTarget(null)} />
        </>
      )}
    </DetailScreen>
  );
}
