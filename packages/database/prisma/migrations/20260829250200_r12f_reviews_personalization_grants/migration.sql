-- R12-F: reviews + personalization grants

GRANT SELECT, INSERT, UPDATE ON "product_reviews" TO worldpharma_app;
GRANT SELECT, INSERT ON "product_review_responses" TO worldpharma_app;
GRANT SELECT, INSERT, UPDATE ON "product_questions" TO worldpharma_app;
GRANT SELECT, INSERT ON "personalization_events" TO worldpharma_app;
