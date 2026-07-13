export type ParseErrorCode =
  | 'missing-frontmatter'
  | 'malformed-frontmatter'
  | 'invalid-frontmatter'
  | 'yaml-alias';

export interface ParseError {
  code: ParseErrorCode;
  message: string;
  path?: string;
}

export interface ParseWarning {
  code: 'unknown-frontmatter';
  message: string;
  path: string;
}
