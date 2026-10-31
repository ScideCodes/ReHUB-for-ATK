import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { KeyboardTabs } from "./KeyboardTabs";
it("shares mouse menu materials, labeled icons and the active glass pill", () => {
  const html = renderToStaticMarkup(
    <KeyboardTabs
      tabs={[
        { id: "keys", label: "Keys" },
        { id: "trigger", label: "Trigger" },
      ]}
      value="keys"
      onChange={() => {}}
    />,
  );
  expect(html).toContain("lg-tabs glass-clear keyboard-tabs");
  expect(html).toContain('class="lg-tab-pill"');
  expect(html.match(/<svg/g)).toHaveLength(2);
  expect(html).toContain('title="Trigger"');
  expect(html).toContain('tabindex="-1"');
});
