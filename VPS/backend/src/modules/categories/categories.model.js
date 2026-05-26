function sanitizeCategory(category) {
  return { ...category };
}

function toPublicCategory(category) {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    parentCategoryId: category.parentCategoryId || null,
    description: category.description || "",
    imageUrl: category.imageUrl || "",
    sortOrder: category.sortOrder || 0
  };
}

module.exports = { sanitizeCategory, toPublicCategory };
