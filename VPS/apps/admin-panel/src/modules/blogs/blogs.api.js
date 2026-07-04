import { apiFetch } from "../../shared/api/http-client";

export function fetchBlogCategories() {
  return apiFetch("/admin/blogs/categories");
}

export function fetchBlogs(filters = {}) {
  const params = new URLSearchParams();
  params.set("includeArchived", String(Boolean(filters.includeArchived)));
  if (filters.q) {
    params.set("q", filters.q);
  }
  if (filters.categoryId) {
    params.set("categoryId", filters.categoryId);
  }
  if (filters.status) {
    params.set("status", filters.status);
  }

  return apiFetch(`/admin/blogs?${params.toString()}`);
}

export function createBlog(payload) {
  return apiFetch("/admin/blogs", {
    method: "POST",
    body: payload
  });
}

export function updateBlog(blogId, payload) {
  return apiFetch(`/admin/blogs/${blogId}`, {
    method: "PATCH",
    body: payload
  });
}

export function archiveBlog(blogId) {
  return apiFetch(`/admin/blogs/${blogId}`, {
    method: "DELETE"
  });
}

export function uploadBlogImage(blogId, file, imageType) {
  const fd = new FormData();
  fd.append("file", file);
  return apiFetch(`/admin/blogs/${blogId}/image?type=${imageType}`, {
    method: "POST",
    body: fd
  });
}
