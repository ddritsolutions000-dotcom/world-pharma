-- R14-A CR-279: terminal checkout state after successful payment
ALTER TYPE "CheckoutStatus" ADD VALUE 'PAID';
