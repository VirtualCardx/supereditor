/**
 * ========================================
 * 图片处理路由模块
 * ========================================
 *
 * 本文件提供图片上传和访问的 HTTP 路由处理
 * 使用 Cloudflare R2 存储桶进行文件存储
 * 支持图片上传和通过URL访问图片
 * 所有路由都需要用户认证
 */

import { Hono } from "hono";
import { AppContext } from "../types/context";

/**
 * 创建图片处理路由实例
 * 使用 AppContext 类型确保类型安全
 * 所有路由都需要通过 authMiddleware 认证
 */
const images = new Hono<AppContext>();

/**
 * ========================================
 * 图片处理路由
 * ========================================
 */

/**
 * 图片上传路由
 *
 * 路由：POST /api/images/upload
 *
 * 功能：
 * - 接收用户上传的图片文件
 * - 将文件保存到 Cloudflare R2 存储桶
 * - 返回图片访问URL
 *
 * 请求：
 * - Content-Type: multipart/form-data
 * - 表单字段: file (图片文件)
 *
 * 响应：
 * ```json
 * {
 *   "message": "Image uploaded successfully",
 *   "fileName": "1672531200000-image.jpg",
 *   "url": "/api/images/1672531200000-image.jpg"
 * }
 * ```
 *
 * 错误响应：
 * ```json
 * {
 *   "error": "No file provided"
 * }
 * ```
 */
images.post("/upload", async (c) => {
  try {
    // 检查用户认证状态
    const user = c.get('user');
    if (!user) {
      console.error("Upload attempt without authentication");
      return c.json({ error: "Authentication required" }, 401);
    }

    console.log("Upload request from user:", user.id);

    // 检查请求的 Content-Type
    const contentType = c.req.header("content-type");
    console.log("Upload request content-type:", contentType);

    // 检查是否是 FormData 请求
    if (!contentType || !contentType.includes('multipart/form-data')) {
      console.error("Invalid content-type for file upload:", contentType);
      return c.json({ error: "Content-Type must be multipart/form-data" }, 400);
    }

    // 从请求中提取表单数据
    let formData;
    try {
      formData = await c.req.formData();
    } catch (formError) {
      console.error("Failed to parse form data:", formError);
      return c.json({ error: "Failed to parse form data" }, 400);
    }

    console.log("FormData keys:", Array.from(formData.keys()));

    // 尝试不同的可能字段名
    let file = formData.get("file") as File;
    if (!file) {
      file = formData.get("image") as File;
    }
    if (!file) {
      file = formData.get("upload") as File;
    }

    // 如果还是没有，检查所有 entries
    if (!file) {
      for (const [key, value] of formData.entries()) {
        console.log(`FormData entry: ${key}:`, value instanceof File ? `File: ${value.name} (${value.size} bytes)` : value);
        if (value instanceof File) {
          file = value;
          break;
        }
      }
    }

    // 验证文件是否存在
    if (!file || !(file instanceof File)) {
      console.error("No file found in form data or invalid file object");
      return c.json({ error: "No file provided or invalid file format" }, 400);
    }

    // 验证文件大小（可选）
    if (file.size === 0) {
      console.error("File is empty");
      return c.json({ error: "File is empty" }, 400);
    }

    console.log("Found file:", file.name, file.type, file.size);

    // 生成唯一的文件名，使用时间戳避免重复
    const fileName = `${Date.now()}-${file.name}`;

    // 准备自定义元数据
    const customMetadata: any = {
      originalName: file.name,
      uploadedAt: new Date().toISOString()
    };

    // 尝试获取图片尺寸
    try {
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      // 使用简单的图片尺寸检测算法
      const dimensions = getImageDimensions(uint8Array, file.name);
      if (dimensions) {
        customMetadata.width = dimensions.width.toString();
        customMetadata.height = dimensions.height.toString();
      }
    } catch (error) {
      console.warn("Failed to detect image dimensions:", error);
      // 继续上传，只是不包含尺寸信息
    }

    // 将文件保存到 Cloudflare R2 存储桶，包含自定义元数据
    await c.env.R2_BUCKET.put(fileName, file, {
      customMetadata: customMetadata
    });

    // 生成图片访问URL
    // 该URL对应的GET路由会在下面定义
    const url = `/api/images/${fileName}`;

    // 返回上传成功响应，包含检测到的尺寸信息
    const response: any = {
      message: "Image uploaded successfully",
      fileName: fileName,
      url: url
    };

    // 如果检测到尺寸，也包含在响应中
    if (customMetadata.width && customMetadata.height) {
      response.width = parseInt(customMetadata.width);
      response.height = parseInt(customMetadata.height);
    }

    return c.json(response);
  } catch (error) {
    // 处理上传过程中的异常
    console.error("Image upload error:", error);

    // 返回详细的错误信息用于调试
    const errorMessage = `Failed to upload image: ${error instanceof Error ? error.message : String(error)}`;

    return c.json({
      error: errorMessage,
      details: error instanceof Error ? error.stack : String(error)
    }, 500);
  }
});

/**
 * 简单的图片尺寸检测函数
 * 支持 JPEG, PNG, GIF, WebP, BMP 格式
 */
function getImageDimensions(data: Uint8Array, fileName: string): { width: number; height: number } | null {
  const extension = fileName.toLowerCase().split('.').pop();

  try {
    switch (extension) {
      case 'jpg':
      case 'jpeg':
        return getJpegDimensions(data);
      case 'png':
        return getPngDimensions(data);
      case 'gif':
        return getGifDimensions(data);
      case 'webp':
        return getWebpDimensions(data);
      case 'bmp':
        return getBmpDimensions(data);
      default:
        return null;
    }
  } catch (error) {
    return null;
  }
}

/**
 * 检测 JPEG 图片尺寸
 */
function getJpegDimensions(data: Uint8Array): { width: number; height: number } | null {
  // JPEG 文件格式解析
  let i = 0;

  // 查找 SOF 标记 (Start Of Frame)
  while (i < data.length - 4) {
    // 查找 0xFF
    if (data[i] === 0xFF) {
      const marker = data[i + 1];

      // SOF0 (Baseline DCT) 或 SOF2 (Progressive DCT)
      if (marker === 0xC0 || marker === 0xC2) {
        const height = (data[i + 5] << 8) | data[i + 6];
        const width = (data[i + 7] << 8) | data[i + 8];
        return { width, height };
      }
    }
    i++;
  }

  return null;
}

/**
 * 检测 PNG 图片尺寸
 */
function getPngDimensions(data: Uint8Array): { width: number; height: number } | null {
  // PNG 文件必须以 8 字节签名开头
  if (data.length < 24 ||
      data[0] !== 0x89 || data[1] !== 0x50 || data[2] !== 0x4E || data[3] !== 0x47 ||
      data[4] !== 0x0D || data[5] !== 0x0A || data[6] !== 0x1A || data[7] !== 0x0A) {
    return null;
  }

  // IHDR 块包含尺寸信息，从第 8 字节开始
  const width = (data[16] << 24) | (data[17] << 16) | (data[18] << 8) | data[19];
  const height = (data[20] << 24) | (data[21] << 16) | (data[22] << 8) | data[23];

  return { width, height };
}

/**
 * 检测 GIF 图片尺寸
 */
function getGifDimensions(data: Uint8Array): { width: number; height: number } | null {
  // GIF 文件必须以 GIF87a 或 GIF89a 开头
  if (data.length < 10 ||
      data[0] !== 0x47 || data[1] !== 0x49 || data[2] !== 0x46) {
    return null;
  }

  // 尺寸信息在第 6-9 字节
  const width = data[6] | (data[7] << 8);
  const height = data[8] | (data[9] << 8);

  return { width, height };
}

/**
 * 检测 WebP 图片尺寸
 */
function getWebpDimensions(data: Uint8Array): { width: number; height: number } | null {
  // WebP 文件格式相对复杂，这里只处理 VP8 格式
  if (data.length < 20) return null;

  try {
    // 查找 VP8 块
    for (let i = 12; i < data.length - 10; i++) {
      if (data[i] === 0x56 && data[i + 1] === 0x50 && data[i + 2] === 0x38) {
        // VP8 格式，尺寸在块开始后的 6-7 和 8-9 字节
        const width = (data[i + 7] & 0x3F) << 8 | data[i + 6];
        const height = (data[i + 9] & 0x3F) << 8 | data[i + 8];
        return { width: width & 0x3FFF, height: height & 0x3FFF };
      }
    }
  } catch (error) {
    // 解析失败
  }

  return null;
}

/**
 * 检测 BMP 图片尺寸
 */
function getBmpDimensions(data: Uint8Array): { width: number; height: number } | null {
  // BMP 文件以 'BM' 开头
  if (data.length < 26 || data[0] !== 0x42 || data[1] !== 0x4D) {
    return null;
  }

  // 尺寸信息在第 18-25 字节（小端序）
  const width = data[18] | (data[19] << 8) | (data[20] << 16) | (data[21] << 24);
  const height = data[22] | (data[23] << 8) | (data[24] << 16) | (data[25] << 24);

  return { width, height };
}

/**
 * 图片访问路由
 *
 * 路由：GET /api/images/:fileName
 *
 * 功能：
 * - 根据文件名从 R2 存储桶中检索图片
 * - 返回图片文件流，包含适当的HTTP头信息
 * - 支持浏览器缓存和条件请求
 *
 * 响应：
 * - 图片文件流，包含正确的 Content-Type 和缓存头信息
 * - 支持 ETag 进行缓存控制
 *
 * 错误响应：
 * ```json
 * {
 *   "error": "Image not found"
 * }
 * ```
 */
images.get("/:fileName", async (c) => {
  try {
    // 从URL路径参数中获取文件名
    const fileName = c.req.param("fileName");

    // 从 Cloudflare R2 存储桶中检索文件对象
    const object = await c.env.R2_BUCKET.get(fileName);

    // 检查文件是否存在
    if (!object) {
      return c.json({ error: "Image not found" }, 404);
    }

    // 设置响应头信息
    const headers = new Headers();

    // 将文件对象的HTTP元数据写入响应头
    // 这包括 Content-Type、Content-Length 等重要信息
    object.writeHttpMetadata(headers);

    // 设置 ETag 用于缓存控制
    // ETag 可以用于条件请求（If-None-Match）
    headers.set('etag', object.httpEtag);

    // 设置缓存控制头，指示浏览器可以缓存图片
    // max-age=3600 表示缓存1小时
    headers.set('cache-control', 'public, max-age=3600');

    // 返回文件流作为HTTP响应
    return new Response(object.body, {
      headers: headers,
      status: 200
    });
  } catch (error) {
    // 处理文件检索过程中的异常
    console.error("Image retrieval error:", error);
    return c.json({ error: "Failed to retrieve image" }, 500);
  }
});

/**
 * 获取图片列表路由
 *
 * 路由：GET /api/images
 *
 * 功能：
 * - 列出用户的所有图片文件
 * - 支持分页和搜索
 * - 返回图片基本信息和尺寸
 *
 * 查询参数：
 * - page: 页码 (默认: 1)
 * - limit: 每页图片数量 (默认: 12)
 * - search: 搜索关键词
 *
 * 响应：
 * ```json
 * {
 *   "images": [
 *     {
 *       "id": "1672531200000-image.jpg",
 *       "name": "image.jpg",
 *       "size": 1024000,
 *       "width": 1920,
 *       "height": 1080,
 *       "url": "/api/images/1672531200000-image.jpg",
 *       "created_at": "2023-01-01T00:00:00.000Z"
 *     }
 *   ],
 *   "pagination": {
 *     "currentPage": 1,
 *     "totalPages": 5,
 *     "totalRecords": 58,
 *     "hasNextPage": true,
 *     "hasPreviousPage": false,
 *     "limit": 12
 *   }
 * }
 * ```
 */
images.get("/", async (c) => {
  try {
    const page = parseInt(c.req.query("page") || "1");
    const limit = parseInt(c.req.query("limit") || "12");
    const search = c.req.query("search") || "";

    // 验证页码和限制
    const currentPage = Math.max(1, page);
    const pageSize = Math.min(Math.max(1, limit), 100); // 限制最大100个

    // 从 R2 存储桶列出所有文件（需要获取全部以支持分页）
    let allImages: any[] = [];
    let cursor: string | undefined;

    do {
      const options: R2ListOptions = {
        limit: 1000, // 每次获取更多数据以减少请求次数
      };

      if (cursor) {
        options.cursor = cursor;
      }

      const result = await c.env.R2_BUCKET.list(options);

      // 过滤只保留图片文件
      const pageImages = result.objects
        .filter(obj => {
          const fileName = obj.key.toLowerCase();
          const extension = fileName.split('.').pop();
          return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico'].includes(extension || '');
        })
        .map(obj => ({
          id: obj.key,
          name: obj.key.split('-').slice(1).join('-'), // 移除时间戳前缀
          size: obj.size,
          url: `/api/images/${obj.key}`,
          created_at: new Date(obj.uploaded).toISOString(),
        }));

      allImages = allImages.concat(pageImages);
      cursor = result.truncated ? result.cursor : undefined;
    } while (cursor);

    // 按创建时间倒序排列（最新的在前）
    allImages.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // 应用搜索过滤
    if (search) {
      allImages = allImages.filter(image =>
        image.name.toLowerCase().includes(search.toLowerCase())
      );
    }

    // 计算分页
    const totalRecords = allImages.length;
    const totalPages = Math.ceil(totalRecords / pageSize);
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedImages = allImages.slice(startIndex, endIndex);

    // 获取图片的元数据和尺寸信息
    const imagesWithMetadata = await Promise.all(
      paginatedImages.map(async (image) => {
        try {
          const object = await c.env.R2_BUCKET.head(image.id);
          const contentType = object?.httpMetadata?.contentType || 'image/jpeg';

          // 对于图片，我们尝试获取图片尺寸
          let width = null;
          let height = null;

          if (contentType.startsWith('image/')) {
            // 首先尝试从自定义元数据中获取尺寸信息
            if (object?.customMetadata?.width && object?.customMetadata?.height) {
              width = parseInt(object.customMetadata.width);
              height = parseInt(object.customMetadata.height);
            } else {
              // 尝试从原始文件名中提取尺寸信息
              const originalName = object?.customMetadata?.originalName || image.name;
              const sizeMatch = originalName.match(/(\d+)x(\d+)/);
              if (sizeMatch) {
                width = parseInt(sizeMatch[1]);
                height = parseInt(sizeMatch[2]);
              } else {
                // 对于不支持实时尺寸检测的格式，暂时返回 null
                // 前端可以通过加载图片来获取真实尺寸
                const extension = image.name.toLowerCase().split('.').pop();

                // 只有对于确定尺寸的格式才设置默认值
                switch (extension) {
                  case 'ico':
                    // 图标文件通常有固定尺寸
                    width = 32;
                    height = 32;
                    break;
                  case 'svg':
                    // SVG 矢量图可以缩放，不设置固定尺寸
                    break;
                  // 对于其他格式，不设置默认尺寸，让前端动态获取
                }
              }
            }
          }

          return {
            ...image,
            type: contentType,
            width,
            height,
          };
        } catch (error) {
          return {
            ...image,
            type: 'image/jpeg',
          };
        }
      })
    );

    return c.json({
      images: imagesWithMetadata,
      pagination: {
        currentPage,
        totalPages,
        totalRecords,
        hasNextPage: currentPage < totalPages,
        hasPreviousPage: currentPage > 1,
        limit: pageSize,
      },
    });
  } catch (error) {
    console.error("Image list error:", error);
    return c.json({ error: "Failed to list images" }, 500);
  }
});

/**
 * 图片删除路由
 *
 * 路由：DELETE /api/images/:fileName
 *
 * 功能：
 * - 从 R2 存储桶中删除图片文件
 *
 * 响应：
 * ```json
 * {
 *   "message": "Image deleted successfully",
 *   "fileName": "1672531200000-image.jpg"
 * }
 * ```
 */
images.delete("/:fileName", async (c) => {
  try {
    const fileName = c.req.param("fileName");

    // 检查图片是否存在
    const object = await c.env.R2_BUCKET.head(fileName);
    if (!object) {
      return c.json({ error: "Image not found" }, 404);
    }

    // 删除图片
    await c.env.R2_BUCKET.delete(fileName);

    return c.json({
      message: "Image deleted successfully",
      fileName: fileName
    });
  } catch (error) {
    console.error("Image deletion error:", error);
    return c.json({ error: "Failed to delete image" }, 500);
  }
});

/**
 * 导出图片处理路由模块
 * 供主应用文件挂载使用
 */
export default images;