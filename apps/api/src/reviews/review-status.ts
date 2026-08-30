import { ProductQuestionStatus, ProductReviewStatus } from '@prisma/client';
import { Errors } from '../common/problem';

const REVIEW_TRANSITIONS: Record<ProductReviewStatus, ProductReviewStatus[]> = {
  [ProductReviewStatus.SUBMITTED]: [ProductReviewStatus.APPROVED, ProductReviewStatus.REJECTED],
  [ProductReviewStatus.APPROVED]: [],
  [ProductReviewStatus.REJECTED]: [],
};

const QUESTION_TRANSITIONS: Record<ProductQuestionStatus, ProductQuestionStatus[]> = {
  [ProductQuestionStatus.SUBMITTED]: [ProductQuestionStatus.APPROVED, ProductQuestionStatus.REJECTED],
  [ProductQuestionStatus.APPROVED]: [],
  [ProductQuestionStatus.REJECTED]: [],
};

export function assertReviewTransition(from: ProductReviewStatus, to: ProductReviewStatus) {
  const allowed = REVIEW_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw Errors.conflict(`Invalid review transition: ${from} -> ${to}`);
  }
}

export function assertQuestionTransition(from: ProductQuestionStatus, to: ProductQuestionStatus) {
  const allowed = QUESTION_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw Errors.conflict(`Invalid question transition: ${from} -> ${to}`);
  }
}

export function isTerminalReviewStatus(status: ProductReviewStatus): boolean {
  return status === ProductReviewStatus.APPROVED || status === ProductReviewStatus.REJECTED;
}

export function isTerminalQuestionStatus(status: ProductQuestionStatus): boolean {
  return status === ProductQuestionStatus.APPROVED || status === ProductQuestionStatus.REJECTED;
}
