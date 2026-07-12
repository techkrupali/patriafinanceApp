import { IconAlert } from "@/components/icons";

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-5 py-14 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-lavender/50 text-navy">
        <IconAlert className="h-5 w-5" />
      </span>
      <p className="text-sm text-muted">{message}</p>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-5 py-14 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-danger/10 text-danger">
        <IconAlert className="h-5 w-5" />
      </span>
      <p className="text-sm font-medium text-danger">{message}</p>
    </div>
  );
}
