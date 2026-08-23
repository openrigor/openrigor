import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import { AIMessage } from "@langchain/core/messages";
import { describe, expect, it } from "vitest";
import { markFormPlaceholders, parseFormUpdates } from "./form-markdown";
import { findLatestFormUpdate } from "./form-markdown";

describe("form markdown placeholders", () => {
  it("turns placeholders into inline nodes that react-markdown can replace", () => {
    const markdown = markFormPlaceholders(
      "# {{title}}\n\n**Course:** {{course}}"
    );
    expect(markdown).toBe(
      "# [{{title}}](#form-field-title)\n\n**Course:** [{{course}}](#form-field-course)"
    );

    const html = renderToStaticMarkup(
      React.createElement(
        ReactMarkdown,
        {
          components: {
            a({ href }) {
              return React.createElement("input", {
                "data-field": href?.replace("#form-field-", ""),
              });
            },
          },
        },
        markdown
      )
    );

    expect(html).toContain('data-field="title"');
    expect(html).toContain('data-field="course"');
    expect(html).not.toContain("#form-field-title");
    expect(html).not.toContain("{{title}}");
  });

  it("extracts valid assistant field updates and removes the protocol block", () => {
    const parsed = parseFormUpdates(
      'I updated the brief.\n<form-updates>{"title":"A brief","word_target":750,"unknown":"ignore"}</form-updates>',
      {
        title: {
          id: "title",
          label: "Title",
          type: "text",
          required: true,
        },
        word_target: {
          id: "word_target",
          label: "Word target",
          type: "number",
          required: true,
        },
      }
    );

    expect(parsed).toEqual({
      updates: { title: "A brief", word_target: 750 },
      cleanContent: "I updated the brief.\n",
    });
  });

  it("consumes HTML-escaped update blocks without changing existing values", () => {
    const parsed = parseFormUpdates(
      "Done. &lt;form-updates&gt;{&quot;word_target&quot;:501}&lt;/form-updates&gt;",
      {
        title: {
          id: "title",
          label: "Title",
          type: "text",
          required: true,
        },
        word_target: {
          id: "word_target",
          label: "Word target",
          type: "number",
          required: true,
        },
      }
    );

    expect(parsed).toEqual({
      updates: { word_target: 501 },
      cleanContent: "Done. ",
    });
  });

  it("removes an update block even when it contains no declared fields", () => {
    const parsed = parseFormUpdates(
      'Done. <form-updates>{"unknown":"ignore"}</form-updates>',
      {
        title: {
          id: "title",
          label: "Title",
          type: "text",
          required: true,
        },
      }
    );

    expect(parsed).toEqual({ updates: {}, cleanContent: "Done. " });
  });

  it("finds an update without an id even when a later AI message exists", () => {
    const update = new AIMessage({
      content: 'Done. <form-updates>{"word_target":502}</form-updates>',
    });
    const laterMessage = new AIMessage({ content: "Anything else?" });

    const result = findLatestFormUpdate([update, laterMessage], {
      word_target: {
        id: "word_target",
        label: "Word target",
        type: "number",
        required: true,
      },
    });

    expect(result?.message).toBe(update);
    expect(result?.parsed.updates).toEqual({ word_target: 502 });
  });
});
