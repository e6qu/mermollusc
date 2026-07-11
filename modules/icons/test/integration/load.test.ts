import { isErr, isOk } from "@m/std";
import { describe, expect, it } from "vitest";
import { findIcon, registerPack } from "../../src/core/index.js";
import { defaultRegistry } from "../../src/core/builtin.js";
import { decodePack, svgViolation } from "../../src/shell/load.js";

const validJson = {
  meta: { id: "aws", license: "vendor (user-supplied)", source: "local", version: "2024.1" },
  icons: { lambda: "<svg>l</svg>", s3: "<svg>s</svg>" },
};

describe("decodePack", () => {
  it("decodes a valid pack payload into an IconPack (icons as a Map)", () => {
    const r = decodePack(validJson);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.meta.id).toBe("aws");
    expect(r.value.icons.get("lambda")).toBe("<svg>l</svg>");
    expect(r.value.icons.size).toBe(2);
  });

  it("defaults icons to an 'all' category when none is given, and honours a provided one", () => {
    const auto = decodePack(validJson);
    expect(isOk(auto)).toBe(true);
    if (isOk(auto)) expect([...auto.value.categories.keys()]).toEqual(["all"]);

    const withCats = decodePack({ ...validJson, categories: { brands: ["lambda", "s3"] } });
    expect(isOk(withCats)).toBe(true);
    if (isOk(withCats)) expect(withCats.value.categories.get("brands")).toEqual(["lambda", "s3"]);
  });

  it("fails loudly when provenance fields are missing or mistyped", () => {
    expect(isErr(decodePack({ icons: { a: "<svg/>" } }))).toBe(true);
    expect(isErr(decodePack({ meta: { id: "x" }, icons: {} }))).toBe(true);
    expect(isErr(decodePack({ meta: validJson.meta, icons: { a: 1 } }))).toBe(true);
    expect(isErr(decodePack("not an object"))).toBe(true);
  });

  it("rejects an icon carrying scripts / event handlers / foreignObject (export-XSS guard)", () => {
    const withIcon = (svg: string) => ({ meta: validJson.meta, icons: { evil: svg } });
    expect(isErr(decodePack(withIcon("<svg><script>alert(1)</script></svg>")))).toBe(true);
    expect(isErr(decodePack(withIcon('<svg onload="alert(1)"></svg>')))).toBe(true);
    expect(
      isErr(decodePack(withIcon("<svg><foreignObject><body></body></foreignObject></svg>"))),
    ).toBe(true);
    expect(isOk(decodePack(withIcon('<svg><path d="M0 0h24v24H0z"/></svg>')))).toBe(true); // clean ok
  });

  it("rejects external fetches and SMIL the old regex denylist missed", () => {
    const withIcon = (svg: string) => ({ meta: validJson.meta, icons: { evil: svg } });
    // an <image> pulling a remote resource (tracking pixel / content smuggling)
    expect(isErr(decodePack(withIcon('<svg><image href="http://evil/x.png"/></svg>')))).toBe(true);
    // a <use> resolving an external document
    expect(isErr(decodePack(withIcon('<svg><use href="https://evil/#g"/></svg>')))).toBe(true);
    expect(isErr(decodePack(withIcon('<svg><use xlink:href="//evil/#g"/></svg>')))).toBe(true);
    // SMIL animation can rewrite attributes (e.g. <set attributeName="href">) — rejected wholesale
    expect(
      isErr(decodePack(withIcon('<svg><set attributeName="href" to="javascript:x"/></svg>'))),
    ).toBe(true);
    expect(isErr(decodePack(withIcon('<svg><animate attributeName="x" to="0"/></svg>')))).toBe(
      true,
    );
    // href schemes that are neither internal nor an inline image payload
    expect(isErr(decodePack(withIcon('<svg><use href="javascript:alert(1)"/></svg>')))).toBe(true);
    expect(isErr(decodePack(withIcon('<svg><use href="data:text/html,<script/>"/></svg>')))).toBe(
      true,
    );
    // a data: payload that could nest scriptable SVG is rejected; inline rasters are not
    expect(
      isErr(decodePack(withIcon('<svg><use href="data:image/svg+xml,<svg onload=x>"/></svg>'))),
    ).toBe(true);
    expect(svgViolation('<svg><use href="data:image/png;base64,iVBORw0KGgo="/></svg>')).toBeNull();
    // internal references stay allowed
    expect(isOk(decodePack(withIcon('<svg><defs><g id="g"/></defs><use href="#g"/></svg>')))).toBe(
      true,
    );
    expect(
      isOk(decodePack(withIcon('<svg><use xlink:href="#g" fill="url(#grad)"/></svg>'))),
    ).toBe(true);
  });

  it("rejects unknown attributes, external style url()s, and markup that escapes the tag scan", () => {
    expect(svgViolation('<svg onbeforescriptexecute="x"></svg>')).not.toBeNull();
    expect(svgViolation('<svg><rect style="fill:url(http://evil)"/></svg>')).not.toBeNull();
    expect(svgViolation('<svg><rect style="fill:url(#grad);opacity:.5"/></svg>')).toBeNull();
    expect(svgViolation("<svg><script</svg>")).not.toBeNull(); // unclosed tag → unparsed '<'
    expect(svgViolation("<svg><!-- <script>alert(1)</script> --></svg>")).toBeNull(); // inert comment
    expect(svgViolation("<svg><!-- unterminated")).not.toBeNull();
    expect(svgViolation('<?xml version="1.0"?><svg/>')).toBeNull();
    expect(svgViolation("<?php evil() ?><svg/>")).not.toBeNull();
    expect(svgViolation("<svg><![CDATA[x]]></svg>")).not.toBeNull();
    expect(svgViolation('<!DOCTYPE svg SYSTEM "http://evil/x.dtd"><svg/>')).not.toBeNull();
    expect(svgViolation("<svg>a < b</svg>")).not.toBeNull(); // bare '<' escapes the tag scan
    expect(svgViolation("<svg focusable><path d='M0 0'/></svg>")).toBeNull(); // valueless attr ok
    expect(svgViolation('<svg><rect style="@import url(evil)"/></svg>')).not.toBeNull();
  });

  it("every bundled pack (authored + vendored) passes the allowlist sanitiser", () => {
    for (const pack of defaultRegistry.packs.values()) {
      for (const [name, svg] of pack.icons) {
        expect(svgViolation(svg), `${pack.meta.id}/${name}`).toBeNull();
      }
      // and the whole pack round-trips through the decode boundary
      const r = decodePack({ meta: pack.meta, icons: Object.fromEntries(pack.icons) });
      expect(isOk(r), pack.meta.id).toBe(true);
    }
  });

  it("a decoded pack registers and resolves through findIcon", () => {
    const r = decodePack(validJson);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    const registry = registerPack({ packs: new Map() }, r.value);
    const icon = findIcon(registry, "aws", "s3");
    expect(isOk(icon)).toBe(true);
    if (isOk(icon)) expect(icon.value).toBe("<svg>s</svg>");
  });
});
