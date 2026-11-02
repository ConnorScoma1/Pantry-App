import { Download } from "lucide-react";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { Card, Eyebrow, Hint } from "@/components/ui/card";

/** Profile → Your data: download a copy (JSON) and read the privacy policy. */
export function YourDataCard() {
  return (
    <Card id="your-data">
      <Eyebrow>Your data</Eyebrow>
      <Hint>
        Download a copy of everything your account can see: your profile, allergies and preferences, kitchen, plans, lists,
        ratings and cooking history. It&apos;s a JSON file you can keep or open in any text editor.
      </Hint>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {/* A plain link so the browser downloads the file with your session. */}
        <a href="/api/account/export" download className={buttonClasses("secondary")}>
          <Download className="size-4" aria-hidden /> Download my data
        </a>
        <Link href="/privacy" className="text-[15px] text-muted underline underline-offset-4">
          Privacy policy
        </Link>
      </div>
    </Card>
  );
}
