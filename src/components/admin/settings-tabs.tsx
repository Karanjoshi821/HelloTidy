import { Tabs } from "./ui";

export function SettingsTabs({ active }: { active: "general" | "staff" | "activity" }) {
  return (
    <Tabs
      label="Settings sections"
      items={[
        { href: "/admin/settings", label: "Store & checkout", active: active === "general" },
        { href: "/admin/settings/staff", label: "Staff", active: active === "staff" },
        { href: "/admin/settings/activity", label: "Activity log", active: active === "activity" },
      ]}
    />
  );
}
