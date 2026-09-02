import { useEffect } from "react";

type SeoOptions = {
  title: string;
  description: string;
  path: string;
  image?: string;
};

const SITE_NAME = "AS-IS GROUP";
const SITE_ORIGIN = "https://www.as-isgroup.co.il";
const DEFAULT_IMAGE = "/as-is-logo.jpeg";

function setMeta(attr: "name" | "property", key: string, content: string) {
  let tag = document.querySelector(`meta[${attr}="${key}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
}

function setLink(rel: string, href: string) {
  let tag = document.querySelector(`link[rel="${rel}"]`);
  if (!tag) {
    tag = document.createElement("link");
    tag.setAttribute("rel", rel);
    document.head.appendChild(tag);
  }
  tag.setAttribute("href", href);
}

/** Sets document title + description + Open Graph / Twitter tags + canonical link for an AS-IS page. */
export function useAsIsSeo({ title, description, path, image = DEFAULT_IMAGE }: SeoOptions) {
  useEffect(() => {
    const fullTitle = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;
    document.title = fullTitle;

    setMeta("name", "description", description);
    setLink("canonical", `${SITE_ORIGIN}${path}`);

    setMeta("property", "og:type", "website");
    setMeta("property", "og:site_name", SITE_NAME);
    setMeta("property", "og:title", fullTitle);
    setMeta("property", "og:description", description);
    setMeta("property", "og:url", `${SITE_ORIGIN}${path}`);
    setMeta("property", "og:image", `${SITE_ORIGIN}${image}`);
    setMeta("property", "og:locale", "he_IL");

    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", fullTitle);
    setMeta("name", "twitter:description", description);
    setMeta("name", "twitter:image", `${SITE_ORIGIN}${image}`);
  }, [title, description, path, image]);
}

/** Injects (and cleans up) a JSON-LD <script> block for structured data. */
export function useAsIsJsonLd(id: string, data: object | null) {
  useEffect(() => {
    if (!data) return;
    document.getElementById(id)?.remove();
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = id;
    script.text = JSON.stringify(data);
    document.head.appendChild(script);
    return () => {
      document.getElementById(id)?.remove();
    };
  }, [id, data]);
}
