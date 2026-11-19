import { type ReactNode, useId } from "react";

/** A titled block of settings with its own save button. */
export const SettingsCard = ({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) => {
  // Named by its heading, so it is a region one can find (and jump to).
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-4 rounded-xl border border-border p-4 md:p-5"
    >
      <div className="flex flex-col gap-1">
        <h3 id={id} className="m-0 text-[16px] font-semibold">
          {title}
        </h3>
        {description ? <p className="m-0 text-[13px] text-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
};
