#!/bin/bash
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/salehalobaylan/Desktop/Silah-Legal/Legal-Case-Management-System
npm run db:migrate && npm run dev:api
