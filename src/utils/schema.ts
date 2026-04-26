import { asObject, getString } from "./json.js";

export interface SchemaField {
  path: string;
  name: string;
  schema: Record<string, unknown>;
  type?: string;
  required: boolean;
}

export function flattenJsonSchema(schema: unknown, basePath = "$", required: string[] = []): SchemaField[] {
  const node = asObject(schema);
  const properties = asObject(node.properties);
  const fields: SchemaField[] = [];

  for (const [name, child] of Object.entries(properties)) {
    const childSchema = asObject(child);
    const path = `${basePath}.properties.${name}`;
    const type = getString(childSchema.type);
    const childRequired = Array.isArray(childSchema.required)
      ? childSchema.required.filter((entry): entry is string => typeof entry === "string")
      : [];

    fields.push({
      path,
      name,
      schema: childSchema,
      type,
      required: required.includes(name)
    });

    if (type === "object" || childSchema.properties) {
      fields.push(...flattenJsonSchema(childSchema, path, childRequired));
    }
  }

  return fields;
}

export function schemaRequired(schema: unknown): string[] {
  const required = asObject(schema).required;
  return Array.isArray(required) ? required.filter((entry): entry is string => typeof entry === "string") : [];
}

export function hasConstraint(schema: Record<string, unknown>): boolean {
  return [
    "enum",
    "const",
    "format",
    "pattern",
    "minLength",
    "maxLength",
    "minimum",
    "maximum",
    "minItems",
    "maxItems"
  ].some((key) => schema[key] !== undefined);
}

export function isOpenObjectSchema(schema: unknown): boolean {
  const node = asObject(schema);
  const type = node.type;
  const properties = asObject(node.properties);
  const hasProperties = Object.keys(properties).length > 0;
  return (type === "object" || node.properties !== undefined) && !hasProperties && node.additionalProperties !== false;
}
