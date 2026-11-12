import { KeyLink } from "@/components/keycap";

export default function NotFound() {
  return (
    <div className="py-10">
      <p className="hold text-[15px]">Kill · kill · kill</p>
      <h1 className="mt-2 text-[34px]">No such page on the wire</h1>
      <p className="mt-2 text-ink-2">The address was mistyped or the item was withdrawn.</p>
      <div className="mt-5">
        <KeyLink href="/release">Back to the wire</KeyLink>
      </div>
    </div>
  );
}
