import eslint from 'eslint';
import { CommentContext } from './comment-context';

export function createLineCommentLineOverflowReport(context: CommentContext) {
  if (context.comment.type !== 'Line') {
    return;
  }

  const text = context.code.lines[context.line - 1];
  if (text.length <= context.max_line_length) {
    return;
  }

  // if there is a comment directive then never overflow

  const content = text.trimStart().slice(2).trimStart();
  if (content.startsWith('eslint-')) {
    return;
  }

  if (content.startsWith('@ts-')) {
    return;
  }

  if (content.startsWith('tslint:')) {
    return;
  }

  // typescript triple slash directive

  if (/^\/\s<(reference|amd)/.test(content)) {
    return;
  }

  const edge = text.lastIndexOf(' ', context.max_line_length);

  const report: eslint.Rule.ReportDescriptor = {
    node: context.node,
    loc: context.comment.loc,
    messageId: 'overflow',
    data: {
      line_length: `${text.length}`,
      max_length: `${context.max_line_length}`
    },
    fix: function (fixer) {
      if (edge === -1) {
        const firstOverflowingCharacter = text.charAt(context.max_line_length);
        const insertedText = firstOverflowingCharacter === ' ' ? '\n//' : '\n// ';
        return fixer.insertTextAfterRange([0, context.line_range_start + context.max_line_length], 
          insertedText);
      } else {
        const firstOverflowingCharacter = text.charAt(edge);
        const insertedText = firstOverflowingCharacter === ' ' ? '\n//' : '\n// ';
        return fixer.insertTextAfterRange([0, context.line_range_start + edge], insertedText);
      }
    }
  };

  return report;
}