import { apiFetch } from "../../shared/api/http-client";

export function listBlogCategories() {
  return apiFetch("/blogs/categories");
}

export function listBlogs(params = {}) {
  const query = new URLSearchParams();
  if (params.q) {
    query.set("q", params.q);
  }
  if (params.categoryId) {
    query.set("categoryId", params.categoryId);
  }
  if (params.tag) {
    query.set("tag", params.tag);
  }
  if (params.limit) {
    query.set("limit", String(params.limit));
  }

  const suffix = query.size ? `?${query.toString()}` : "";
  return apiFetch(`/blogs${suffix}`);
}

export function getBlog(slug) {
  return apiFetch(`/blogs/${slug}`);
}
