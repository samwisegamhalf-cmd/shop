ALTER TABLE "ShoppingItem" DROP COLUMN IF EXISTS "category";

ALTER TABLE "ProductDictionary" DROP COLUMN IF EXISTS "defaultCategory";

ALTER TABLE "RecipeIngredient" DROP COLUMN IF EXISTS "category";
