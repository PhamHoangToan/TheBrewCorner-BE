#!/bin/bash

# ============================================
# Script tạo folder structure NestJS Café
# Usage: bash create-nestjs-structure.sh
# ============================================

BASE="src"

# ─── Tạo file gốc ───────────────────────────
touch $BASE/main.ts
touch $BASE/app.module.ts

# ─── config/ ────────────────────────────────
mkdir -p $BASE/config
touch $BASE/config/database.config.ts
touch $BASE/config/jwt.config.ts
touch $BASE/config/app.config.ts

# ─── common/ ────────────────────────────────
mkdir -p $BASE/common/decorators
touch $BASE/common/decorators/current-user.decorator.ts
touch $BASE/common/decorators/roles.decorator.ts

mkdir -p $BASE/common/guards
touch $BASE/common/guards/jwt-auth.guard.ts
touch $BASE/common/guards/roles.guard.ts

mkdir -p $BASE/common/filters
touch $BASE/common/filters/http-exception.filter.ts

mkdir -p $BASE/common/interceptors
touch $BASE/common/interceptors/transform.interceptor.ts

mkdir -p $BASE/common/pipes
touch $BASE/common/pipes/validation.pipe.ts

mkdir -p $BASE/common/dto
touch $BASE/common/dto/pagination.dto.ts

# ─── Helper function tạo module ─────────────
make_module() {
  local MODULE=$1
  local DIR="$BASE/modules/$MODULE"
  mkdir -p $DIR/entities $DIR/dto $DIR/strategies 2>/dev/null
  touch $DIR/${MODULE}.module.ts
  touch $DIR/${MODULE}.controller.ts
  touch $DIR/${MODULE}.service.ts
}

# ─── auth/ ──────────────────────────────────
make_module auth
mkdir -p $BASE/modules/auth/strategies
touch $BASE/modules/auth/strategies/jwt.strategy.ts
touch $BASE/modules/auth/dto/login.dto.ts
touch $BASE/modules/auth/dto/change-password.dto.ts
rm -rf $BASE/modules/auth/entities  # auth không có entity riêng

# ─── users/ ─────────────────────────────────
make_module users
touch $BASE/modules/users/entities/user.entity.ts
touch $BASE/modules/users/dto/create-user.dto.ts
touch $BASE/modules/users/dto/update-user.dto.ts

# ─── categories/ ────────────────────────────
make_module categories
touch $BASE/modules/categories/entities/category.entity.ts
touch $BASE/modules/categories/dto/create-category.dto.ts
touch $BASE/modules/categories/dto/update-category.dto.ts

# ─── products/ (có sub: sizes, toppings) ────
make_module products
touch $BASE/modules/products/entities/product.entity.ts
touch $BASE/modules/products/entities/product-size.entity.ts
touch $BASE/modules/products/entities/topping.entity.ts
touch $BASE/modules/products/entities/product-topping.entity.ts
touch $BASE/modules/products/dto/create-product.dto.ts
touch $BASE/modules/products/dto/update-product.dto.ts
touch $BASE/modules/products/dto/create-topping.dto.ts
touch $BASE/modules/products/dto/create-size.dto.ts

# ─── areas/ ─────────────────────────────────
make_module areas
touch $BASE/modules/areas/entities/area.entity.ts
touch $BASE/modules/areas/dto/create-area.dto.ts

# ─── tables/ ────────────────────────────────
make_module tables
touch $BASE/modules/tables/entities/table.entity.ts
touch $BASE/modules/tables/dto/create-table.dto.ts
touch $BASE/modules/tables/dto/update-table-status.dto.ts

# ─── orders/ ────────────────────────────────
make_module orders
touch $BASE/modules/orders/entities/order.entity.ts
touch $BASE/modules/orders/entities/order-item.entity.ts
touch $BASE/modules/orders/entities/order-item-topping.entity.ts
touch $BASE/modules/orders/dto/create-order.dto.ts
touch $BASE/modules/orders/dto/update-order-item.dto.ts

# ─── invoices/ ──────────────────────────────
make_module invoices
touch $BASE/modules/invoices/entities/invoice.entity.ts
touch $BASE/modules/invoices/entities/invoice-payment.entity.ts
touch $BASE/modules/invoices/dto/create-invoice.dto.ts

# ─── promotions/ ────────────────────────────
make_module promotions
touch $BASE/modules/promotions/entities/promotion.entity.ts
touch $BASE/modules/promotions/dto/create-promotion.dto.ts

# ─── shifts/ ────────────────────────────────
make_module shifts
touch $BASE/modules/shifts/entities/shift.entity.ts
touch $BASE/modules/shifts/entities/shift-assignment.entity.ts
touch $BASE/modules/shifts/dto/create-shift.dto.ts

# ─── ingredients/ (kho) ─────────────────────
make_module ingredients
touch $BASE/modules/ingredients/entities/ingredient.entity.ts
touch $BASE/modules/ingredients/entities/ingredient-import.entity.ts
touch $BASE/modules/ingredients/entities/product-recipe.entity.ts
touch $BASE/modules/ingredients/dto/create-ingredient.dto.ts
touch $BASE/modules/ingredients/dto/import-ingredient.dto.ts

# ─── reports/ (không có entity) ─────────────
mkdir -p $BASE/modules/reports
touch $BASE/modules/reports/reports.module.ts
touch $BASE/modules/reports/reports.controller.ts
touch $BASE/modules/reports/reports.service.ts

# ─── database/ ──────────────────────────────
mkdir -p $BASE/database/migrations
mkdir -p $BASE/database/seeds
touch $BASE/database/seeds/seed.ts

echo ""
echo "✅ Done! Folder structure created successfully."
echo ""
echo "📁 Tree preview:"
find $BASE -type f | sort | sed 's|[^/]*/|  |g'
