import { db } from '../schema';
import type { Recipe } from '../types';
import { Repository } from './base';

class RecipeRepository extends Repository<Recipe> {
  listByCreatedDesc(): Promise<Recipe[]> {
    return this.table.orderBy('createdAt').reverse().toArray();
  }
}

export const recipeRepo = new RecipeRepository(db.recipes);
