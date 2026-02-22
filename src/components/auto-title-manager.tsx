"use client";
import { useEffect } from "react";
const INTERACTIVE_SELECTOR = [
  "a",
  "button",
  "input",
  "select",
  "textarea",
  "summary",
  "[role='button']",
  "[role='link']",
  "[role='menuitem']",
].join(", ");
function normalizeText(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  return value.replace(/\s+/g, " ").trim();
}
function getTextFromIds(value: string | null): string {
  if (!value) {
    return "";
  }
  const ids = value
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const parts: string[] = [];
  for (const id of ids) {
    const target = document.getElementById(id);
    if (!target) {
      continue;
    }
    const text = normalizeText(target.textContent);
    if (text) {
      parts.push(text);
    }
  }
  return normalizeText(parts.join(" "));
}
function getNearestLabelText(element: HTMLElement): string {
  if (!("id" in element) || !element.id) {
    const parentLabel = element.closest("label");
    return normalizeText(parentLabel?.textContent);
  }
  const escapedId = CSS.escape(element.id);
  const externalLabel = document.querySelector(`label[for='${escapedId}']`);
  if (externalLabel) {
    return normalizeText(externalLabel.textContent);
  }
  const parentLabel = element.closest("label");
  return normalizeText(parentLabel?.textContent);
}
function getElementIntentText(element: HTMLElement): string {
  const ariaLabel = normalizeText(element.getAttribute("aria-label"));
  if (ariaLabel) {
    return ariaLabel;
  }
  const labelledBy = getTextFromIds(element.getAttribute("aria-labelledby"));
  if (labelledBy) {
    return labelledBy;
  }
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
  ) {
    const labelText = getNearestLabelText(element);
    if (labelText) {
      return labelText;
    }
  }
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement
  ) {
    const placeholder = normalizeText(element.placeholder);
    if (placeholder) {
      return placeholder;
    }
  }
  const titleCandidate = normalizeText(element.textContent);
  if (titleCandidate) {
    return titleCandidate;
  }
  return normalizeText(element.getAttribute("name"));
}
function deriveTitleForElement(element: HTMLElement): string {
  const intent = getElementIntentText(element);
  if (element instanceof HTMLAnchorElement) {
    return intent ? `Open: ${intent}` : "Open link";
  }
  if (element instanceof HTMLButtonElement) {
    return intent ? `Action: ${intent}` : "Button action";
  }
  if (element instanceof HTMLSelectElement) {
    return intent ? `Select option for: ${intent}` : "Select option";
  }
  if (element instanceof HTMLTextAreaElement) {
    return intent ? `Enter details for: ${intent}` : "Enter details";
  }
  if (element instanceof HTMLInputElement) {
    const inputType = element.type.toLowerCase();
    if (inputType === "search") {
      return intent ? `Search: ${intent}` : "Search field";
    }
    if (inputType === "email") {
      return intent ? `Enter email: ${intent}` : "Enter email";
    }
    if (inputType === "password") {
      return intent ? `Enter password: ${intent}` : "Enter password";
    }
    if (inputType === "number") {
      return intent ? `Choose number for: ${intent}` : "Enter number";
    }
    if (inputType === "checkbox") {
      return intent ? `Toggle: ${intent}` : "Toggle option";
    }
    if (inputType === "radio") {
      return intent ? `Choose: ${intent}` : "Choose option";
    }
    if (inputType === "file") {
      return intent ? `Upload file for: ${intent}` : "Upload file";
    }
    return intent ? `Enter value for: ${intent}` : "Input field";
  }
  return intent || "Interactive element";
}
function applyTitleToElement(element: HTMLElement): void {
  if (element.dataset.titleSkip === "true") {
    return;
  }
  const existingTitle = normalizeText(element.getAttribute("title"));
  if (existingTitle) {
    return;
  }
  const title = deriveTitleForElement(element);
  if (!title) {
    return;
  }
  element.setAttribute("title", title);
}
function applyTitlesWithin(root: ParentNode | Element): void {
  if (root instanceof Element && root.matches(INTERACTIVE_SELECTOR)) {
    applyTitleToElement(root as HTMLElement);
  }
  const elements = root.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR);
  for (const element of elements) {
    applyTitleToElement(element);
  }
}
export function AutoTitleManager() {
  useEffect(() => {
    if (!document.body) {
      return;
    }
    applyTitlesWithin(document.body);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (
          mutation.type === "attributes" &&
          mutation.target instanceof HTMLElement
        ) {
          applyTitleToElement(mutation.target);
          continue;
        }
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) {
            continue;
          }
          applyTitlesWithin(node);
        }
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "aria-label",
        "aria-labelledby",
        "placeholder",
        "name",
        "id",
      ],
    });
    return () => {
      observer.disconnect();
    };
  }, []);
  return null;
}
