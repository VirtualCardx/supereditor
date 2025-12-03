/**
 * ========================================
 * 文件处理路由模块
 * ========================================
 *
 * 本文件提供完整的文件管理 HTTP 路由处理
 * 使用 Cloudflare R2 存储桶进行文件存储
 * 支持文件上传、下载、删除、列表等完整功能
 * 所有路由都需要用户认证
 */

import { Hono } from "hono";
import { AppContext } from "../types/context";

/**
 * 创建文件处理路由实例
 * 使用 AppContext 类型确保类型安全
 * 所有路由都需要通过 authMiddleware 认证
 */
const files = new Hono<AppContext>();

/**
 * ========================================
 * 文件处理路由
 * ========================================
 */

/**
 * 获取文件列表路由
 *
 * 路由：GET /api/files
 *
 * 功能：
 * - 列出用户的所有文件
 * - 支持分页和搜索
 * - 返回文件基本信息
 *
 * 查询参数：
 * - page: 页码（从1开始，默认为1）
 * - limit: 每页记录数（默认为15，最大为50）
 * - search: 搜索关键词
 * - type: 文件类型过滤 (image, document, other)
 *
 * 响应：
 * ```json
 * {
 *   "files": [
 *     {
 *       "id": "1672531200000-document.pdf",
 *       "name": "document.pdf",
 *       "size": 1024000,
 *       "type": "application/pdf",
 *       "url": "/api/files/1672531200000-document.pdf",
 *       "created_at": "2023-01-01T00:00:00.000Z",
 *       "updated_at": "2023-01-01T00:00:00.000Z"
 *     }
 *   ],
 *   "folders": [
 *     {
 *       "id": "1672531200000-folder/.folder",
 *       "key": "1672531200000-folder/.folder",
 *       "name": "folder",
 *       "size": 0,
 *       "url": null,
 *       "type": "folder",
 *       "created_at": "2023-01-01T00:00:00.000Z",
 *       "updated_at": "2023-01-01T00:00:00.000Z"
 *     }
 *   ],
 *   "pagination": {
 *     "currentPage": 1,
 *     "totalPages": 5,
 *     "totalRecords": 58,
 *     "hasNextPage": true,
 *     "hasPreviousPage": false,
 *     "limit": 15
 *   }
 * }
 * ```
 */
files.get("/", async (c) => {
  try {
    // 获取分页参数，参考 documents.ts 的实现
    const pageParam = c.req.query('page');
    const limitParam = c.req.query('limit');
    const search = c.req.query("search") || "";
    const type = c.req.query("type");
    const path = c.req.query("path") || "/";

    // 设置默认值和限制，每页15个项目
    const limit = Math.min(50, Math.max(1, parseInt(limitParam || '15') || 15)); // 默认15，最大50，最小1

    // 计算分页信息
    const page = Math.max(1, parseInt(pageParam || '1') || 1); // 页码从1开始，最小为1
    const offset = (page - 1) * limit;

    // 处理路径参数
    let cleanPath = path;
    if (path && path !== '/' && path.trim() !== '') {
      // 移除路径开头的斜杠并确保不以斜杠结尾
      cleanPath = path.replace(/^\/+/, '').replace(/\/+$/, '');
    }

    // 首先获取所有文件来计算总数
    const allResult = await c.env.R2_BUCKET.list({});

    // 处理文件列表，分离文件夹和文件
    const allProcessedItems = allResult.objects.map(obj => {
      const key = obj.key;

      // 检查是否是文件夹（以 /.folder 结尾）
      if (key.endsWith('/.folder')) {
        const folderName = key.replace('/.folder', '');

        // 提取路径信息
        const pathParts = folderName.split('/');
        const fullName = pathParts.pop() || folderName;
        const folderPath = pathParts.join('/');

        // 移除时间戳前缀（格式：timestamp-foldername）
        let cleanName = fullName;
        const timestampMatch = fullName.match(/^(\d+)-(.+)$/);
        if (timestampMatch) {
          cleanName = timestampMatch[2];
        }

        return {
          id: key,
          key: key,
          name: cleanName,
          originalName: folderName,
          path: folderPath,
          size: 0,
          url: null,
          type: 'folder',
          created_at: new Date(obj.uploaded).toISOString(),
          updated_at: new Date(obj.uploaded).toISOString(),
        };
      }

      // 处理普通文件
      // 提取路径信息
      const pathParts = key.split('/');
      const fullName = pathParts.pop() || key;
      const filePath = pathParts.join('/');

      // 移除时间戳前缀（格式：timestamp-filename）
      let cleanName = fullName;
      const timestampMatch = fullName.match(/^(\d+)-(.+)$/);
      if (timestampMatch) {
        cleanName = timestampMatch[2];
      }

      return {
        id: key,
        key: key,
        name: cleanName,
        originalName: fullName,
        path: filePath,
        size: obj.size,
        url: `/api/files/${key}`,
        type: 'file',
        created_at: new Date(obj.uploaded).toISOString(),
        updated_at: new Date(obj.uploaded).toISOString(),
      };
    });

    // 分离文件夹和文件
    let allFolders = allProcessedItems.filter(item => item.type === 'folder');
    let allFiles = allProcessedItems.filter(item => item.type === 'file');

    // 应用路径过滤
    if (cleanPath && cleanPath !== '/') {
      allFolders = allFolders.filter(folder => folder.path === cleanPath);
      allFiles = allFiles.filter(file => file.path === cleanPath);
    } else {
      // 在根目录下，只显示没有路径的文件和文件夹
      allFolders = allFolders.filter(folder => !folder.path || folder.path === '');
      allFiles = allFiles.filter(file => !file.path || file.path === '');
    }

    // 应用搜索过滤
    if (search) {
      const searchTerm = search.toLowerCase();
      allFolders = allFolders.filter(folder =>
        folder.name.toLowerCase().includes(searchTerm)
      );
      allFiles = allFiles.filter(file =>
        file.name.toLowerCase().includes(searchTerm)
      );
    }

    // 应用类型过滤（仅对文件）
    if (type) {
      allFiles = allFiles.filter(file => {
        const extension = file.name.split('.').pop()?.toLowerCase();
        if (type === 'image') {
          return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(extension || '');
        } else if (type === 'document') {
          return ['pdf', 'doc', 'docx', 'txt', 'md', 'rtf'].includes(extension || '');
        }
        return true;
      });
    }

    // 合并文件夹和文件进行分页
    const allItems = [...allFolders, ...allFiles];
    const totalRecords = allItems.length;

    // 应用分页
    const paginatedItems = allItems.slice(offset, offset + limit);

    // 获取文件的元数据信息（仅对当前页的文件）
    const paginatedFiles = paginatedItems.filter(item => item.type === 'file');
    const filesWithMetadata = await Promise.all(
      paginatedFiles.map(async (file) => {
        try {
          const object = await c.env.R2_BUCKET.head(file.id);
          const contentType = object?.httpMetadata?.contentType || 'application/octet-stream';

          // 尝试获取图片尺寸（仅适用于图片）
          let width = null;
          let height = null;
          if (contentType.startsWith('image/')) {
            // 这里可以添加图片尺寸检测逻辑
            // 由于 Cloudflare Workers 环境限制，这里暂时返回 null
          }

          return {
            ...file,
            type: contentType,
            width,
            height,
          };
        } catch (error) {
          return {
            ...file,
            type: 'application/octet-stream',
          };
        }
      })
    );

    // 处理文件夹元数据
    const paginatedFolders = paginatedItems.filter(item => item.type === 'folder');
    const foldersWithMetadata = paginatedFolders.map(folder => ({
      ...folder,
      type: 'folder'
    }));

    // 计算分页信息，参考 documents.ts
    const totalPages = Math.ceil(totalRecords / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    // 返回文件夹和文件信息，添加分页元数据
    // 注意：files 字段只包含文件，folders 字段只包含文件夹
    return c.json({
      files: filesWithMetadata,
      folders: foldersWithMetadata,
      pagination: {
        currentPage: page,
        totalPages,
        totalRecords,
        hasNextPage,
        hasPreviousPage,
        limit
      }
    });
  } catch (error) {
    console.error("File list error:", error);
    return c.json({ error: "Failed to list files" }, 500);
  }
});

/**
 * 文件上传路由
 *
 * 路由：POST /api/files/upload
 *
 * 功能：
 * - 接收用户上传的文件
 * - 将文件保存到 Cloudflare R2 存储桶
 * - 返回文件访问URL
 *
 * 请求：
 * - Content-Type: multipart/form-data
 * - 表单字段: file (文件)
 * - 表单字段: path (可选的文件夹路径)
 *
 * 响应：
 * ```json
 * {
 *   "message": "File uploaded successfully",
 *   "id": "1672531200000-document.pdf",
 *   "name": "document.pdf",
 *   "size": 1024000,
 *   "url": "/api/files/1672531200000-document.pdf"
 * }
 * ```
 */
files.post("/upload", async (c) => {
  try {
    // 检查用户认证状态
    const user = c.get('user');
    if (!user) {
      console.error("Upload attempt without authentication");
      return c.json({ error: "Authentication required" }, 401);
    }

    console.log("File upload request from user:", user.id);

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

    const path = formData.get("path") as string || "";

    // 文件大小检查 (50MB 限制)
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      return c.json({ error: "File too large. Maximum size is 50MB" }, 400);
    }

    // 生成唯一的文件名
    const fileName = `${Date.now()}-${file.name}`;

    // 处理路径，确保不会产生双斜杠
    let fullPath = fileName;
    if (path && path !== '/' && path.trim() !== '') {
      // 移除路径开头的斜杠并确保不以斜杠结尾
      const cleanPath = path.replace(/^\/+/, '').replace(/\/+$/, '');
      fullPath = `${cleanPath}/${fileName}`;
    }

    // 设置文件元数据
    const customMetadata: any = {
      originalName: file.name,
      uploadedAt: new Date().toISOString(),
      userId: user.id.toString(),
    };

    // 检测图片尺寸（如果上传的是图片）
    let imageDimensions = null;
    if (file.type && file.type.startsWith('image/')) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        // 使用图片尺寸检测算法
        imageDimensions = getImageDimensions(uint8Array, file.name);
        if (imageDimensions) {
          customMetadata.width = imageDimensions.width.toString();
          customMetadata.height = imageDimensions.height.toString();
          console.log(`Image dimensions detected: ${imageDimensions.width}x${imageDimensions.height}`);
        }
      } catch (error) {
        console.warn("Failed to detect image dimensions:", error);
        // 继续上传，只是不包含尺寸信息
      }
    }

    const metadata = {
      httpMetadata: {
        contentType: file.type || 'application/octet-stream',
      },
      customMetadata: customMetadata,
    };

    // 上传文件到 R2
    await c.env.R2_BUCKET.put(fullPath, file, metadata);

    console.log("File uploaded successfully:", fullPath);

    // 返回上传成功响应，包含检测到的尺寸信息（如果是图片）
    const response: any = {
      message: "File uploaded successfully",
      id: fullPath,
      name: file.name,
      size: file.size,
      url: `/api/files/${fullPath}`,
      path: path,
    };

    // 如果检测到图片尺寸，也包含在响应中
    if (imageDimensions) {
      response.width = imageDimensions.width;
      response.height = imageDimensions.height;
    }

    return c.json(response);
  } catch (error) {
    // 处理上传过程中的异常
    console.error("File upload error:", error);

    // 返回详细的错误信息用于调试
    const errorMessage = `Failed to upload file: ${error instanceof Error ? error.message : String(error)}`;

    return c.json({
      error: errorMessage,
      details: error instanceof Error ? error.stack : String(error)
    }, 500);
  }
});

/**
 * 文件下载路由
 *
 * 路由：GET /api/files/download/:fileName
 *
 * 功能：
 * - 强制下载文件而不是在浏览器中显示
 */
files.get("/download/:fileName", async (c) => {
  try {
    const fileName = c.req.param('fileName');
    if (!fileName) {
      return c.json({ error: "File name is required" }, 400);
    }

    const object = await c.env.R2_BUCKET.get(fileName);

    if (!object) {
      return c.json({ error: "File not found" }, 404);
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);

    // 强制下载
    const originalName = object.customMetadata?.originalName || fileName.split('-').slice(1).join('-');
    headers.set('content-disposition', `attachment; filename="${encodeURIComponent(originalName)}"`);

    return new Response(object.body, {
      headers: headers,
      status: 200
    });
  } catch (error) {
    console.error("File download error:", error);
    return c.json({ error: "Failed to download file" }, 500);
  }
});

/**
 * 文件访问路由
 *
 * 路由：GET /api/files/:fileName
 *
 * 功能：
 * - 根据文件名从 R2 存储桶中检索文件
 * - 返回文件流，包含适当的HTTP头信息
 * - 支持浏览器缓存
 */
files.get("/:fileName", async (c) => {
  try {
    // 从URL路径参数中获取文件名
    const fileName = c.req.param('fileName');
    const object = await c.env.R2_BUCKET.get(fileName);

    if (!object) {
      return c.json({ error: "File not found" }, 404);
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('cache-control', 'public, max-age=3600');

    // 设置下载文件名
    const originalName = object.customMetadata?.originalName;
    if (originalName) {
      headers.set('content-disposition', `inline; filename="${encodeURIComponent(originalName)}"`);
    }

    return new Response(object.body, {
      headers: headers,
      status: 200
    });
  } catch (error) {
    console.error("File retrieval error:", error);
    return c.json({ error: "Failed to retrieve file" }, 500);
  }
});

/**
 * 文件删除路由
 *
 * 路由：DELETE /api/files/:fileName
 *
 * 功能：
 * - 从 R2 存储桶中删除文件
 */
files.delete("/:fileName", async (c) => {
  try {
    const fileName = c.req.param('fileName');
    if (!fileName) {
      return c.json({ error: "File name is required" }, 400);
    }

    // 检查文件是否存在
    const object = await c.env.R2_BUCKET.head(fileName);
    if (!object) {
      return c.json({ error: "File not found" }, 404);
    }

    // 删除文件
    await c.env.R2_BUCKET.delete(fileName);

    return c.json({
      message: "File deleted successfully",
      fileName: fileName
    });
  } catch (error) {
    console.error("File deletion error:", error);
    return c.json({ error: "Failed to delete file" }, 500);
  }
});

/**
 * 文件重命名路由
 *
 * 路由：POST /api/files/rename
 *
 * 功能：
 * - 重命名文件（实际上是复制后删除原文件）
 *
 * 请求体：
 * ```json
 * {
 *   "fileId": "1672531200000-oldname.pdf",
 *   "newName": "newname.pdf",
 *   "isFolder": false
 * }
 * ```
 */
files.post("/rename", async (c) => {
  try {
    const { fileId, newName, isFolder } = await c.req.json();

    if (!fileId || !newName) {
      return c.json({ error: "fileId and newName are required" }, 400);
    }

    // 验证新名称
    if (newName.includes('/') || newName.includes('\\')) {
      return c.json({ error: "Invalid name. Cannot contain / or \\" }, 400);
    }

    if (isFolder) {
      // 处理文件夹重命名
      if (!fileId.endsWith('/.folder')) {
        return c.json({ error: "Invalid folder ID" }, 400);
      }

      // 提取原始文件夹路径和名称
      const folderPath = fileId.replace('/.folder', '');
      const pathParts = folderPath.split('/');
      const fullName = pathParts.pop() || folderPath;
      const parentPath = pathParts.join('/');

      // 移除时间戳前缀获取原始名称
      const timestampMatch = fullName.match(/^(\d+)-(.+)$/);
      const timestamp = timestampMatch ? timestampMatch[1] : '';

      // 生成新的文件夹标记路径
      const newFolderName = timestamp ? `${timestamp}-${newName}` : newName;
      const newFolderPath = parentPath ? `${parentPath}/${newFolderName}/.folder` : `${newFolderName}/.folder`;

      // 创建新的文件夹标记文件
      await c.env.R2_BUCKET.put(newFolderPath, "", {
        customMetadata: {
          type: "folder",
          folderName: newName,
          createdAt: new Date().toISOString(),
          renamedAt: new Date().toISOString(),
        },
      });

      // 删除旧的文件夹标记文件
      await c.env.R2_BUCKET.delete(fileId);

      return c.json({
        message: "Folder renamed successfully",
        oldPath: fileId,
        newPath: newFolderPath,
      });
    } else {
      // 处理文件重命名
      const oldObject = await c.env.R2_BUCKET.get(fileId);
      if (!oldObject) {
        return c.json({ error: "File not found" }, 404);
      }

      // 生成新文件路径（保持时间戳前缀）
      const pathParts = fileId.split('/');
      const fileName = pathParts.pop() || '';
      const timestamp = fileName.split('-')[0];
      const newPath = pathParts.length > 0 ?
        `${pathParts.join('/')}/${timestamp}-${newName}` :
        `${timestamp}-${newName}`;

      // 复制文件到新路径
      await c.env.R2_BUCKET.put(newPath, oldObject.body, {
        httpMetadata: oldObject.httpMetadata,
        customMetadata: {
          ...oldObject.customMetadata,
          originalName: newName,
          renamedAt: new Date().toISOString(),
        },
      });

      // 删除原文件
      await c.env.R2_BUCKET.delete(fileId);

      return c.json({
        message: "File renamed successfully",
        oldPath: fileId,
        newPath: newPath,
        url: `/api/files/${newPath}`,
      });
    }
  } catch (error) {
    console.error("Rename error:", error);
    return c.json({ error: "Failed to rename" }, 500);
  }
});

/**
 * 创建文件夹路由
 *
 * 路由：POST /api/files/create-folder
 *
 * 功能：
 * - 在 R2 中创建文件夹（通过创建空文件标记）
 *
 * 请求体：
 * ```json
 * {
 *   "name": "folder-name",
 *   "path": "/parent/path"
 * }
 * ```
 */
files.post("/create-folder", async (c) => {
  try {
    const { name, path = "" } = await c.req.json();

    if (!name) {
      return c.json({ error: "Folder name is required" }, 400);
    }

    // 验证文件夹名称
    if (name.includes('/') || name.includes('\\')) {
      return c.json({ error: "Invalid folder name" }, 400);
    }

    // 创建文件夹标记文件
    const timestamp = Date.now();

    // 处理路径，确保不会产生双斜杠
    let cleanPath = path;
    if (path && path !== '/' && path.trim() !== '') {
      // 移除路径开头的斜杠并确保不以斜杠结尾
      cleanPath = path.replace(/^\/+/, '').replace(/\/+$/, '');
    }

    const folderMarker = cleanPath && cleanPath !== '/' ?
      `${cleanPath}/${timestamp}-${name}/.folder` :
      `${timestamp}-${name}/.folder`;

    await c.env.R2_BUCKET.put(folderMarker, "", {
      customMetadata: {
        type: "folder",
        folderName: name,
        createdAt: new Date().toISOString(),
      },
    });

    return c.json({
      message: "Folder created successfully",
      name: name,
      path: path,
    });
  } catch (error) {
    console.error("Folder creation error:", error);
    return c.json({ error: "Failed to create folder" }, 500);
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
 * 导出文件处理路由模块
 */
export default files;