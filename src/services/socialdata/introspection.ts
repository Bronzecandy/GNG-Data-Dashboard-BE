export const INTROSPECTION_QUERY = `
query IntrospectionQuery {
  __schema {
    queryType { name }
    mutationType { name }
    types {
      ...FullType
    }
  }
}

fragment FullType on __Type {
  kind
  name
  description
  fields(includeDeprecated: true) {
    name
    description
    args {
      name
      description
      defaultValue
      type { ...TypeRef }
    }
    type { ...TypeRef }
  }
  inputFields {
    name
    description
    defaultValue
    type { ...TypeRef }
  }
  interfaces { ...TypeRef }
  enumValues(includeDeprecated: true) {
    name
    description
  }
  possibleTypes { ...TypeRef }
}

fragment TypeRef on __Type {
  kind
  name
  ofType {
    kind
    name
    ofType {
      kind
      name
      ofType {
        kind
        name
        ofType {
          kind
          name
        }
      }
    }
  }
}
`;

type GqlTypeRef = {
  kind?: string;
  name?: string | null;
  ofType?: GqlTypeRef | null;
};

export type GqlField = {
  name: string;
  description?: string | null;
  args?: Array<{ name: string; type?: GqlTypeRef }>;
  type?: GqlTypeRef;
};

export type GqlType = {
  kind: string;
  name?: string | null;
  description?: string | null;
  fields?: GqlField[] | null;
  inputFields?: GqlField[] | null;
  enumValues?: Array<{ name: string; description?: string | null }> | null;
};

export type IntrospectionSchema = {
  __schema: {
    queryType?: { name: string } | null;
    mutationType?: { name: string } | null;
    types: GqlType[];
  };
};

const KEYWORD_RE = /comment|post|video|content|message|reply|feed|item|channel|credential|connect/i;

export function unwrapTypeName(t?: GqlTypeRef | null): string {
  if (!t) return "unknown";
  if (t.name) return t.name;
  return unwrapTypeName(t.ofType ?? null);
}

export function scanSchemaForKeywords(schema: IntrospectionSchema): {
  matchingTypes: Array<{ name: string; kind: string; fields: string[] }>;
  matchingQueryFields: Array<{ name: string; args: string[]; returnType: string }>;
} {
  const types = schema.__schema.types.filter((t) => t.name && KEYWORD_RE.test(t.name));
  const matchingTypes = types.map((t) => ({
    name: t.name!,
    kind: t.kind,
    fields: (t.fields ?? []).map((f) => f.name),
  }));

  const queryTypeName = schema.__schema.queryType?.name ?? "Query";
  const queryType = schema.__schema.types.find((t) => t.name === queryTypeName);
  const matchingQueryFields = (queryType?.fields ?? [])
    .filter((f) => KEYWORD_RE.test(f.name))
    .map((f) => ({
      name: f.name,
      args: (f.args ?? []).map((a) => `${a.name}: ${unwrapTypeName(a.type)}`),
      returnType: unwrapTypeName(f.type),
    }));

  return { matchingTypes, matchingQueryFields };
}

export function listQueryFields(schema: IntrospectionSchema): Array<{
  name: string;
  args: string[];
  returnType: string;
}> {
  const queryTypeName = schema.__schema.queryType?.name ?? "Query";
  const queryType = schema.__schema.types.find((t) => t.name === queryTypeName);
  return (queryType?.fields ?? []).map((f) => ({
    name: f.name,
    args: (f.args ?? []).map((a) => `${a.name}: ${unwrapTypeName(a.type)}`),
    returnType: unwrapTypeName(f.type),
  }));
}

export function getType(schema: IntrospectionSchema, name: string): GqlType | undefined {
  return schema.__schema.types.find((t) => t.name === name);
}
