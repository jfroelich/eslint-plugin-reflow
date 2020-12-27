import { CommentContext } from '../comment-context';
import { parseLine } from "../parse-line";
import { checkLineOverflow } from './line-overflow';
import { checkLineUnderflow } from './line-underflow';

export function checkLineComment(context: CommentContext) {
  if (context.comment.type !== 'Line') {
    return;
  }

  const line = parseLine(context.code, context.comment, context.comment.loc.start.line);

  const report = checkLineOverflow(context, line);
  if (report) {
    return report;
  }

  return checkLineUnderflow(context, line);
}