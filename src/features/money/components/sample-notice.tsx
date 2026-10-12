import { FlaskConical } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Says that a screen shows sample data: until the services that read the
 * database exist, the screens are drawn from sample objects, and nothing typed
 * into them is kept.
 */
export function SampleNotice({ title, description }: { title: string; description: string }) {
  return (
    <Alert className="border-app border-info/35 bg-info/8">
      <FlaskConical className="text-info" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
    </Alert>
  );
}
