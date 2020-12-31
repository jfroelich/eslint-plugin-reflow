import eslint from 'eslint';
import estree from 'estree';

export interface CommentContext {
  node: estree.Node;
  code: eslint.SourceCode;
  max_line_length: number;
  in_md_fence?: boolean;
  in_jsdoc_example?: boolean;
}

export interface CommentLine {
  /**
   * Reference to the context of the comment that contains the line. This is not accessed via
   * comment.context because we refrain from injecting custom properties into external objects.
   */
  context: CommentContext;

  /**
   * Reference to comment that contains the line.
   */
  comment: estree.Comment;

  /**
   * The ESLint line index, which is 1-based. This should not be confused with some kind of index
   * into an array of lines for a comment. This is the global index for the entire file.
   */
  index: number;

  /**
   * Whitespace characters leading up to the open region. For a block comment, it is assumed that
   * block comments that follow another kind of token on the same line are never analyzed, so this
   * means that this is whitespace starting from the first character in the line.
   */
  lead_whitespace: string;

  /**
   * The syntactical characters that start the comment. For block comments this is only set on the
   * first line and for all other lines is an empty string. This does not include the whitespace
   * preceding or following the characters. For javadoc-formatted block comments this does not
   * include the second asterisk. For triple slash line comments, this does not include the third
   * slash.
   */
  open: string;

  /**
   * The characters that end the comment. For block comments this is set on the last line. In all
   * other situations this is an empty string. This does not include the whitespace preceding or
   * following the star slash.
   */
  close: string;

  /**
   * The full text of a line containing a comment. The text does not include line break characters
   * because of how ESLint parses the lines. The text may include characters that are not a part of
   * the comment because the value is derived from a value in ESLint's line array which is computed
   * separately from its comments array. The text includes the comment syntax like the forward
   * slashes. Because it is assumed that block comments that follow another kind of token on the
   * same line are not analyzed, the text starts from the first character on the line.
   */
  text: string;

  /**
   * The characters between the comment open and the start of the content. For example, for a single
   * line comment, this is the whitespace following the slashes and before the text. For a javadoc
   * formatted comment line in the middle of the comment, this might include a leading asterisk
   * followed by some whitespace. For the first line of a javadoc comment, this will include the
   * second asterisk as its first character.
   */
  prefix: string;

  /**
   * The text of the comment line between its prefix and suffix.
   */
  content: string;

  /**
   * Represents the occassional initial markup that appears at the start of the line's content such
   * as a jsdoc tag or some markdown. Markup does not precede the content like the prefix; it
   * overlaps.
   */
  markup: string;

  /**
   * Represents the whitespace immediately following the markup token up to the first non-space
   * character (exclusive). Overlaps with content.
   */
  markup_space: string;

  /**
   * Represents a directive such tslint or globals or @ts-ignore. This does not include the trailing
   * space or the trailing text after the directive.
   */
  directive: string;

  /**
   * Contains the start of some FIXME text if the comment content contains some.
   *
   * @example
   *   // TODO(jfroelich): Add support for fixme to this project!
   *   // BUG: Only supporting uppercase is a feature.
   */
  fixme: string;

  /** Whitespace that follows the content and precedes the close. */
  suffix: string;
}

type Region = keyof Pick<CommentLine,
  'lead_whitespace' | 'open' | 'close' | 'prefix' | 'content' | 'suffix' | 'close'>;

/**
 * Returns the length of the text in the given line up to the end of the given region.
 */
export function endIndexOf(line: CommentLine, region: Region) {
  switch (region) {
    case 'lead_whitespace': {
      return line.lead_whitespace.length;
    }

    case 'open': {
      return line.lead_whitespace.length + line.open.length;
    }

    case 'prefix': {
      return line.lead_whitespace.length + line.open.length + line.prefix.length;
    }

    case 'content': {
      return line.lead_whitespace.length + line.open.length + line.prefix.length +
        line.content.length;
    }

    case 'suffix': {
      return line.lead_whitespace.length + line.open.length + line.prefix.length +
        line.content.length + line.suffix.length;
    }

    case 'close': {
      return line.lead_whitespace.length + line.open.length + line.prefix.length +
        line.content.length + line.suffix.length + line.close.length;
    }

    default: {
      throw new Error(`Unknown/unsupported region "${<string>region}"`);
    }
  }
}

export function parseLine(context: CommentContext, comment: estree.Comment, lineIndex: number) {
  const line = <CommentLine>{};
  line.context = context;
  line.comment = comment;
  line.index = lineIndex;
  line.text = context.code.lines[lineIndex - 1];

  const textTrimmedStart = line.text.trimStart();
  line.lead_whitespace = line.text.slice(0, line.text.length - textTrimmedStart.length);

  if (comment.type === 'Line') {
    line.open = '//';
    line.close = '';

    // TODO: support triple slashes, treat the 3rd slash a part of the prefix, and upon making this
    // change make sure to fix the typescript <reference> check in line-comment handlers

    const afterOpen = line.text.slice(line.lead_whitespace.length + line.open.length);
    const afterOpenTrimStart = afterOpen.trimStart();
    const afterOpenSpaceLen = afterOpen.length - afterOpenTrimStart.length;
    line.prefix = line.text.slice(line.lead_whitespace.length + line.open.length,
      line.lead_whitespace.length + line.open.length + afterOpenSpaceLen);
    line.content = line.text.slice(line.lead_whitespace.length + line.open.length +
      line.prefix.length).trimEnd();
    line.suffix = line.text.slice(line.lead_whitespace.length + line.open.length +
      line.prefix.length + line.content.length);
  } else if (comment.type === 'Block') {
    if (lineIndex === comment.loc.start.line && lineIndex === comment.loc.end.line) {
      line.open = '/*';
      line.close = '*/';
      const prefixHaystack = line.text.slice(line.lead_whitespace.length + line.open.length,
        comment.loc.end.column - line.close.length);
      const prefixMatch = /^\**\s*/.exec(prefixHaystack);
      line.prefix = prefixMatch ? prefixMatch[0] : '';
      line.content = line.text.slice(line.lead_whitespace.length + line.open.length +
        line.prefix.length, comment.loc.end.column - line.close.length).trimEnd();
      line.suffix = line.text.slice(line.lead_whitespace.length + line.open.length +
        line.prefix.length + line.content.length, comment.loc.end.column - line.close.length);
    } else if (lineIndex === comment.loc.start.line) {
      line.open = '/*';
      line.close = '';
      const prefixHaystack = line.text.slice(line.lead_whitespace.length + line.open.length);
      const prefixMatch = /^\*+\s*/.exec(prefixHaystack);
      line.prefix = prefixMatch ? prefixMatch[0] : '';
      line.content = line.text.slice(line.lead_whitespace.length + line.open.length +
        line.prefix.length).trimEnd();
      line.suffix = line.text.slice(line.lead_whitespace.length + line.open.length +
        line.prefix.length + line.content.length);
    } else if (lineIndex === comment.loc.end.line) {
      line.open = '';
      line.close = '*/';
      const prefixHaystack = line.text.slice(line.lead_whitespace.length,
        comment.loc.end.column - line.close.length);
      const prefixMatch = /^\*\s+/.exec(prefixHaystack);
      line.prefix = prefixMatch ? prefixMatch[0] : '';
      line.content = line.text.slice(line.lead_whitespace.length + line.open.length +
        line.prefix.length, comment.loc.end.column - line.close.length).trimEnd();
      line.suffix = line.text.slice(line.lead_whitespace.length + line.open.length +
        line.prefix.length + line.content.length, comment.loc.end.column - line.close.length);
    } else {
      line.open = '';
      line.close = '';
      const prefixMatch = /^\*\s+/.exec(textTrimmedStart);
      line.prefix = prefixMatch ? prefixMatch[0] : '';
      line.content = line.text.slice(line.lead_whitespace.length + line.open.length +
        line.prefix.length).trimEnd();
      line.suffix = line.text.slice(line.lead_whitespace.length + line.open.length +
        line.prefix.length + line.content.length);
    }
  } else {
    // eslint for some reason if forgetting about its own shebang type in the AST
    // TODO: define my own Comment type and use it in place of eslint's erroneous type
    throw new TypeError(`Unexpected comment type "${<string>comment.type}"`);
  }

  const [markup, markupSpace] = parseMarkup(comment, line.prefix, line.content);
  line.markup = markup;
  line.markup_space = markupSpace;

  line.directive = parseDirective(line);
  line.fixme = parseFixme(line.content);

  return line;
}

/**
 * Parses the content for markup. Returns an array where the first element is some of the markup
 * and the second is trailing whitespace if any. This focuses on markdown but it can also match
 * jsdoc.
 *
 * @todo use line parameter instead of 3 params
 * @todo consider creating a jsdoc prop and a markdown prop and not mixing the two.
 */
function parseMarkup(comment: estree.Comment, prefix: string, content: string) {
  // Only recognize markup in block comments.
  if (comment.type !== 'Block') {
    return ['', ''];
  }

  // Only recognize markup in javadoc comments
  if (!prefix.startsWith('*')) {
    return ['', ''];
  }

  if (!content.length) {
    return ['', ''];
  }

  // TODO: markdown horizontal rules
  // TODO: indented lists (we might already support this because whitespace in prefix)

  const matches = /^([*-]|\d+\.|@[a-zA-Z]+|#{1,6})(\s+)/.exec(content);
  if (matches && matches.length === 3) {
    return [matches[1], matches[2]];
  }

  // markdown table parsing, this probably could be written better

  if (/^\|.+\|$/.test(content)) {
    return [content, ''];
  }

  return ['', ''];
}

function parseDirective(line: CommentLine) {
  if (line.content.length === 0) {
    return '';
  }

  if (line.index === line.comment.loc.start.line && !line.prefix.startsWith('*') &&
    line.content.startsWith('tslint:')) {
    return 'tslint';
  }

  if (line.index === line.comment.loc.start.line && line.content.startsWith('global ')) {
    return 'global';
  }

  if (line.index === line.comment.loc.start.line && line.content.startsWith('globals ')) {
    return 'globals';
  }

  if (line.index === line.comment.loc.start.line && line.content.startsWith('jslint ')) {
    return 'jslint';
  }

  if (line.index === line.comment.loc.start.line && line.content.startsWith('property ')) {
    return 'property';
  }

  if (line.index === line.comment.loc.start.line && line.content.startsWith('eslint ')) {
    return 'eslint';
  }

  if (line.content.startsWith('jshint ')) {
    return 'jshint';
  }

  if (line.content.startsWith('istanbul ')) {
    return 'istanbul';
  }

  if (line.content.startsWith('jscs ')) {
    return 'jscs';
  }

  if (line.content.startsWith('eslint-env')) {
    return 'eslint-env';
  }

  if (line.content.startsWith('eslint-disable')) {
    return 'eslint-disable';
  }

  if (line.content.startsWith('eslint-enable')) {
    return 'eslint-enable';
  }

  if (line.content.startsWith('eslint-disable-next-line')) {
    return 'eslint-disable-next-line';
  }

  if (line.content.startsWith('eslint-disable-line')) {
    return 'eslint-disable-line';
  }

  if (line.content.startsWith('exported')) {
    return 'exported';
  }

  if (line.content.startsWith('@ts-check')) {
    return '@ts-check';
  }

  if (line.content.startsWith('@ts-nocheck')) {
    return '@ts-nocheck';
  }

  if (line.content.startsWith('@ts-ignore')) {
    return '@ts-ignore';
  }

  if (line.content.startsWith('@ts-expect-error')) {
    return '@ts-expect-error';
  }

  if (line.comment.type === 'Line' && /^\/\s*<(reference|amd)/.test(line.content)) {
    return line.content.slice(1).trimLeft();
  }

  return '';
}

/**
 * @todo regex
 * @todo do we indent the text on overflow? if so we need to figure out the indent level.
 */
function parseFixme(content: string) {
  if (content.startsWith('FIXME: ')) {
    return 'FIXME';
  }

  if (content.startsWith('TODO: ')) {
    return 'TODO';
  }

  if (content.startsWith('NOTE: ')) {
    return 'NOTE';
  }

  if (content.startsWith('BUG: ')) {
    return 'BUG';
  }

  if (content.startsWith('WARN: ')) {
    return 'WARN';
  }

  if (content.startsWith('WARNING: ')) {
    return 'WARNING';
  }

  if (content.startsWith('HACK: ')) {
    return 'HACK';
  }

  // if (/^todo\(?.+\)?\:|warn\:|hack\:/i.test(currentLine.content)) {
  //   return;
  // }

  if (content.startsWith('TODO(')) {
    return 'TODO';
  }

  return '';
}

/**
 * Split a string into an array of word, hyphen, and space tokens.
 */
export function tokenize(string: string) {
  const matches = string.matchAll(/[^\s-]+|(?:\s+|-)/g);
  const tokens: string[] = [];

  for (const match of matches) {
    tokens.push(match[0]);
  }

  return tokens;
}