# Expected Clustering Results

## Test Data Overview
- **Total files**: 100
- **Expected clusters**: 7 (with 10 files each)
- **Expected unassigned**: 10 files (isolated, no dependencies)

## Cluster Definitions

### Cluster 1: Auth (10 files)
**Path**: `src/app/auth/`
**Cohesion**: HIGH - all files heavily import each other

| File | Key Imports |
|------|-------------|
| auth.service.ts | auth.config, token.service, auth.state, auth.models |
| auth.guard.ts | auth.service, auth.config |
| auth.interceptor.ts | token.service, auth.config |
| token.service.ts | auth.config |
| auth.config.ts | (none - base config) |
| auth.state.ts | auth.models |
| auth.models.ts | (none - interfaces) |
| login.component.ts | auth.service, auth.models, auth.config |
| logout.component.ts | auth.service, auth.config |
| auth.module.ts | ALL auth files |

### Cluster 2: User (10 files)
**Path**: `src/app/user/`
**Cohesion**: HIGH

| File | Key Imports |
|------|-------------|
| user.service.ts | user.models, user.state, user.api |
| user.models.ts | (none - interfaces) |
| user.state.ts | user.models |
| user.api.ts | user.models |
| user-profile.component.ts | user.service, user.models, user.state |
| user-settings.component.ts | user.service, user.models, user.state |
| user-list.component.ts | user.api, user.models |
| user-avatar.component.ts | user.models |
| user-search.component.ts | user.api, user.models |
| user.module.ts | ALL user files |

### Cluster 3: Product (10 files)
**Path**: `src/app/product/`
**Cohesion**: HIGH

| File | Key Imports |
|------|-------------|
| product.service.ts | product.models, product.api, product.state |
| product.models.ts | (none - interfaces) |
| product.api.ts | product.models |
| product.state.ts | product.models |
| product-list.component.ts | product.service, product.models, product.state |
| product-detail.component.ts | product.service, product.models |
| product-card.component.ts | product.models |
| product-filter.component.ts | product.models, product.service |
| product-search.component.ts | product.api, product.models |
| product.module.ts | ALL product files |

### Cluster 4: Cart (10 files)
**Path**: `src/app/cart/`
**Cohesion**: HIGH

| File | Key Imports |
|------|-------------|
| cart.service.ts | cart.models, cart.state, cart.api |
| cart.models.ts | (none - interfaces) |
| cart.state.ts | cart.models |
| cart.api.ts | cart.models |
| cart.component.ts | cart.service, cart.models, cart.state |
| cart-item.component.ts | cart.models, cart.service |
| cart-summary.component.ts | cart.models |
| cart-icon.component.ts | cart.state, cart.models |
| cart-promo.component.ts | cart.api, cart.models |
| cart.module.ts | ALL cart files |

### Cluster 5: Order (10 files)
**Path**: `src/app/order/`
**Cohesion**: HIGH

| File | Key Imports |
|------|-------------|
| order.service.ts | order.models, order.api, order.state |
| order.models.ts | (none - interfaces) |
| order.api.ts | order.models |
| order.state.ts | order.models |
| order-list.component.ts | order.service, order.models |
| order-detail.component.ts | order.service, order.models |
| order-status.component.ts | order.models |
| order-tracking.component.ts | order.models |
| order-invoice.component.ts | order.models |
| order.module.ts | ALL order files |

### Cluster 6: UI Components (10 files)
**Path**: `src/app/ui/`
**Cohesion**: MEDIUM - connected via module, some standalone

| File | Key Imports |
|------|-------------|
| button.component.ts | @angular/core |
| input.component.ts | @angular/core, @angular/forms |
| modal.component.ts | @angular/core |
| dropdown.component.ts | @angular/core |
| table.component.ts | @angular/core |
| pagination.component.ts | @angular/core |
| tooltip.directive.ts | @angular/core |
| loading.component.ts | @angular/core |
| alert.component.ts | @angular/core |
| ui.module.ts | ALL ui files |

### Cluster 7: Utils (10 files)
**Path**: `src/app/utils/`
**Cohesion**: MEDIUM - connected via index barrel

| File | Key Imports |
|------|-------------|
| date.utils.ts | date-helpers |
| date-helpers.ts | (none) |
| string.utils.ts | (none) |
| number.utils.ts | (none) |
| array.utils.ts | (none) |
| validation.utils.ts | (none) |
| storage.utils.ts | (none) |
| http.utils.ts | (none) |
| object.utils.ts | (none) |
| index.ts | ALL utils files |

### Unassigned: Isolated Files (10 files)
**Path**: `src/app/isolated/`
**Cohesion**: NONE - no internal dependencies

| File | Dependencies |
|------|--------------|
| standalone-helper.ts | NONE |
| constants.ts | NONE |
| types.ts | NONE |
| regex-patterns.ts | NONE |
| error-codes.ts | NONE |
| math-helpers.ts | NONE |
| color-utils.ts | NONE |
| crypto-utils.ts | NONE |
| env-config.ts | NONE |
| animations.ts | NONE |

## Evaluation Criteria

### Perfect Score
- 7 clusters detected
- Each cluster contains exactly the 10 files from its domain
- 10 isolated files in unassigned

### Good Score (>80%)
- 6-8 clusters detected
- Most files (>8) in each cluster are from the same domain
- Isolated files mostly unassigned

### Acceptable Score (>60%)
- 5-10 clusters detected
- Majority of files grouped by domain
- Some cross-domain mixing acceptable for edge cases

### Poor Score (<60%)
- Random clustering
- Domains split across multiple clusters
- Isolated files incorrectly clustered

## Notes for Tuning

1. **Topological weight** should favor domain clustering since imports are domain-specific
2. **Content similarity** should help group files with similar terminology (e.g., "auth", "user")
3. **Resolution** should be tuned to produce ~7-10 clusters for 100 files
4. **Isolated files** are the key test - they should NOT be clustered (no edges)
