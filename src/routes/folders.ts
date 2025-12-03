/**
 * ========================================
 * 文件夹管理路由模块
 * ========================================
 *
 * 本文件提供文件夹的 CRUD 操作 HTTP 路由处理
 * 所有路由都需要用户认证，确保用户只能操作自己的文件夹
 * 支持文件夹的层级结构和文档分类管理
 */

import { Hono } from "hono";
import { createSupabaseClient } from "../utils/supabaseClient";
import { AppContext } from "../types/context";

/**
 * 创建文件夹管理路由实例
 * 使用 AppContext 类型确保类型安全
 * 所有路由都需要通过 authMiddleware 认证
 */
const folders = new Hono<AppContext>();

/**
 * ========================================
 * 文件夹 CRUD 操作路由
 * ========================================
 */

/**
 * 获取用户文件夹列表路由（支持层级结构）
 *
 * 路由：GET /api/folders
 *
 * 查询参数：
 * - parent_id: 父文件夹ID（可选，null表示获取根目录文件夹）
 *
 * 功能：
 * - 获取当前用户的所有文件夹
 * - 支持获取特定父文件夹下的子文件夹
 * - 按创建时间排序
 *
 * 响应：
 * ```json
 * {
 *   "folders": [
 *     {
 *       "id": "folder_id",
 *       "name": "文件夹名称",
 *       "description": "文件夹描述",
 *       "parent_id": null,
 *       "user_id": "user_id",
 *       "created_at": "2023-01-01T00:00:00Z",
 *       "updated_at": "2023-01-01T00:00:00Z",
 *       "document_count": 5
 *     }
 *   ]
 * }
 * ```
 */
folders.get("/", async (c) => {
    // 创建 Supabase 客户端实例
    const supabase = createSupabaseClient(
        c.env.SUPABASE_URL,
        c.env.SUPABASE_ANON_KEY
    );

    // 从认证中间件设置的上下文中获取用户信息
    const user = c.get('user');
    const parentId = c.req.query('parent_id');

    // 构建查询
    let query = supabase
        .from('folders')
        .select(`
            *,
            documents:documents(count)
        `)
        .eq('user_id', user.id);

    // 如果指定了父文件夹ID，添加过滤条件
    if (parentId === 'null' || parentId === '') {
        query = query.is('parent_id', null); // 根目录文件夹
    } else if (parentId) {
        query = query.eq('parent_id', parentId); // 指定父文件夹下的子文件夹
    } else {
        query = query.is('parent_id', null); // 默认获取根目录
    }

    // 执行查询，按创建时间排序
    const { data, error } = await query.order('created_at', { ascending: true });

    // 处理数据库查询错误
    if (error) {
        return c.json({ error: error.message }, 500);
    }

    // 计算每个文件夹的文档数量
    const foldersWithCount = data.map(folder => ({
        ...folder,
        document_count: folder.documents?.[0]?.count || 0,
        documents: undefined // 移除嵌套的文档数据
    }));

    // 返回文件夹列表
    return c.json({
        folders: foldersWithCount
    });
});

/**
 * 获取文件夹层级结构路由（树形结构）
 *
 * 路由：GET /api/folders/tree
 *
 * 功能：
 * - 获取当前用户的完整文件夹层级结构
 * - 返回树形结构便于前端渲染
 *
 * 响应：
 * ```json
 * {
 *   "tree": [
 *     {
 *       "id": "folder_id",
 *       "name": "文件夹名称",
 *       "description": "文件夹描述",
 *       "document_count": 5,
 *       "children": [...]
 *     }
 *   ]
 * }
 * ```
 */
folders.get("/tree", async (c) => {
    // 创建 Supabase 客户端实例
    const supabase = createSupabaseClient(
        c.env.SUPABASE_URL,
        c.env.SUPABASE_ANON_KEY
    );

    // 从认证中间件设置的上下文中获取用户信息
    const user = c.get('user');

    // 获取用户的所有文件夹
    const { data, error } = await supabase
        .from('folders')
        .select(`
            id,
            name,
            description,
            parent_id,
            created_at,
            updated_at,
            documents:documents(count)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

    // 处理数据库查询错误
    if (error) {
        return c.json({ error: error.message }, 500);
    }

    // 构建树形结构
    const buildTree = (folders: any[], parentId = null) => {
        return folders
            .filter(folder => folder.parent_id === parentId)
            .map(folder => ({
                id: folder.id,
                name: folder.name,
                description: folder.description,
                parent_id: folder.parent_id,
                created_at: folder.created_at,
                updated_at: folder.updated_at,
                document_count: folder.documents?.[0]?.count || 0,
                children: buildTree(folders, folder.id)
            }));
    };

    const tree = buildTree(data);

    // 返回文件夹树
    return c.json({ tree });
});

/**
 * 创建新文件夹路由
 *
 * 路由：POST /api/folders
 *
 * 功能：
 * - 创建新的文件夹
 * - 支持指定父文件夹
 * - 自动关联当前用户
 *
 * 请求体：
 * ```json
 * {
 *   "name": "文件夹名称",
 *   "description": "文件夹描述（可选）",
 *   "parent_id": "父文件夹ID（可选）"
 * }
 * ```
 *
 * 响应：
 * ```json
 * {
 *   "id": "folder_id",
 *   "name": "文件夹名称",
 *   "description": "文件夹描述",
 *   "parent_id": "父文件夹ID",
 *   "user_id": "user_id",
 *   "created_at": "2023-01-01T00:00:00Z",
 *   "updated_at": "2023-01-01T00:00:00Z"
 * }
 * ```
 */
folders.post("/", async (c) => {
    // 创建 Supabase 客户端实例
    const supabase = createSupabaseClient(
        c.env.SUPABASE_URL,
        c.env.SUPABASE_ANON_KEY
    );

    // 从认证中间件设置的上下文中获取用户信息
    const user = c.get('user');
    const { name, description, parent_id } = await c.req.json();

    // 验证必需字段
    if (!name || name.trim() === '') {
        return c.json({ error: '文件夹名称不能为空' }, 400);
    }

    // 如果指定了父文件夹，验证其存在性和归属权
    if (parent_id) {
        const { data: parentFolder, error: parentError } = await supabase
            .from('folders')
            .select('id')
            .eq('id', parent_id)
            .eq('user_id', user.id)
            .single();

        if (parentError || !parentFolder) {
            return c.json({ error: '父文件夹不存在或无权限访问' }, 400);
        }
    }

    // 检查同级文件夹下是否有重名
    const { data: existingFolder } = await supabase
        .from('folders')
        .select('id')
        .eq('user_id', user.id)
        .eq('name', name.trim())
        .eq('parent_id', parent_id || null)
        .single();

    if (existingFolder) {
        return c.json({ error: '同目录下已存在同名文件夹' }, 400);
    }

    // 创建新文件夹
    const { data, error } = await supabase
        .from('folders')
        .insert([
            {
                name: name.trim(),
                description: description?.trim() || null,
                parent_id: parent_id || null,
                user_id: user.id
            }
        ])
        .select();

    // 处理数据库插入错误
    if (error) {
        return c.json({ error: error.message }, 500);
    }

    // 返回新创建的文件夹信息
    return c.json(data[0]);
});

/**
 * 获取单个文件夹详情路由
 *
 * 路由：GET /api/folders/:id
 *
 * 功能：
 * - 获取指定文件夹的详细信息
 * - 包含文档数量统计
 * - 验证文件夹归属权
 *
 * 响应：
 * ```json
 * {
 *   "id": "folder_id",
 *   "name": "文件夹名称",
 *   "description": "文件夹描述",
 *   "parent_id": null,
 *   "user_id": "user_id",
 *   "document_count": 5,
 *   "created_at": "2023-01-01T00:00:00Z",
 *   "updated_at": "2023-01-01T00:00:00Z"
 * }
 * ```
 */
folders.get("/:id", async (c) => {
    // 创建 Supabase 客户端实例
    const supabase = createSupabaseClient(
        c.env.SUPABASE_URL,
        c.env.SUPABASE_ANON_KEY
    );

    // 从认证中间件设置的上下文中获取用户信息
    const user = c.get('user');
    const folderId = c.req.param("id");

    // 查询文件夹详情
    const { data, error } = await supabase
        .from('folders')
        .select(`
            *,
            documents:documents(count)
        `)
        .eq('id', folderId)
        .eq('user_id', user.id)
        .single();

    // 处理数据库查询错误
    if (error) {
        if (error.code === 'PGRST116') {
            return c.json({ error: '文件夹不存在' }, 404);
        }
        return c.json({ error: error.message }, 500);
    }

    // 返回文件夹信息，包含文档数量
    return c.json({
        ...data,
        document_count: data.documents?.[0]?.count || 0,
        documents: undefined // 移除嵌套的文档数据
    });
});

/**
 * 更新文件夹路由
 *
 * 路由：PUT /api/folders/:id
 *
 * 功能：
 * - 更新文件夹信息
 * - 验证文件夹归属权
 * - 防止循环引用（父文件夹不能是自己的子文件夹）
 *
 * 请求体：
 * ```json
 * {
 *   "name": "更新后的名称",
 *   "description": "更新后的描述",
 *   "parent_id": "新的父文件夹ID"
 * }
 * ```
 *
 * 响应：
 * ```json
 * {
 *   "id": "folder_id",
 *   "name": "更新后的名称",
 *   "description": "更新后的描述",
 *   "parent_id": "新的父文件夹ID",
 *   "user_id": "user_id",
 *   "created_at": "2023-01-01T00:00:00Z",
 *   "updated_at": "2023-01-01T12:00:00Z"
 * }
 * ```
 */
folders.put("/:id", async (c) => {
    // 创建 Supabase 客户端实例
    const supabase = createSupabaseClient(
        c.env.SUPABASE_URL,
        c.env.SUPABASE_ANON_KEY
    );

    // 从认证中间件设置的上下文中获取用户信息
    const user = c.get('user');
    const folderId = c.req.param("id");
    const { name, description, parent_id } = await c.req.json();

    // 验证必需字段
    if (!name || name.trim() === '') {
        return c.json({ error: '文件夹名称不能为空' }, 400);
    }

    // 防止将自己设置为父文件夹（循环引用）
    if (parent_id === folderId) {
        return c.json({ error: '不能将文件夹设置为自己的父文件夹' }, 400);
    }

    // 如果指定了新的父文件夹，验证其存在性和归属权
    if (parent_id) {
        const { data: parentFolder, error: parentError } = await supabase
            .from('folders')
            .select('id')
            .eq('id', parent_id)
            .eq('user_id', user.id)
            .single();

        if (parentError || !parentFolder) {
            return c.json({ error: '父文件夹不存在或无权限访问' }, 400);
        }

        // 检查是否会造成循环引用
        const checkCircularReference = async (checkFolderId: string, targetParentId: string): Promise<boolean> => {
            let currentParentId = targetParentId;
            let depth = 0;
            const maxDepth = 100; // 防止无限循环

            while (currentParentId && depth < maxDepth) {
                if (currentParentId === checkFolderId) {
                    return true; // 发现循环引用
                }

                const { data: parentData } = await supabase
                    .from('folders')
                    .select('parent_id')
                    .eq('id', currentParentId)
                    .single();

                currentParentId = parentData?.parent_id;
                depth++;
            }

            return false;
        };

        const isCircular = await checkCircularReference(folderId, parent_id);
        if (isCircular) {
            return c.json({ error: '不能移动到自己的子文件夹中' }, 400);
        }
    }

    // 检查同级文件夹下是否有重名
    const { data: existingFolder } = await supabase
        .from('folders')
        .select('id')
        .eq('user_id', user.id)
        .eq('name', name.trim())
        .eq('parent_id', parent_id || null)
        .neq('id', folderId) // 排除当前文件夹
        .single();

    if (existingFolder) {
        return c.json({ error: '同目录下已存在同名文件夹' }, 400);
    }

    // 更新文件夹信息
    const { data, error } = await supabase
        .from('folders')
        .update({
            name: name.trim(),
            description: description?.trim() || null,
            parent_id: parent_id || null,
            updated_at: new Date().toISOString()
        })
        .eq('id', folderId)
        .eq('user_id', user.id)
        .select();

    // 处理数据库更新错误
    if (error) {
        return c.json({ error: error.message }, 500);
    }

    // 检查是否有记录被更新（可能文件夹不存在或不属于当前用户）
    if (data.length === 0) {
        return c.json({ error: '文件夹不存在或无权限访问' }, 404);
    }

    // 返回更新后的文件夹信息
    return c.json(data[0]);
});

/**
 * 删除文件夹路由
 *
 * 路由：DELETE /api/folders/:id
 *
 * 功能：
 * - 删除指定文件夹
 * - 自动删除子文件夹（CASCADE）
 * - 自动将文件夹内的文档移至根目录（SET NULL）
 * - 验证文件夹归属权
 *
 * 响应：
 * ```json
 * {
 *   "message": "文件夹 folder_id 已删除",
 *   "affected_documents": 5
 * }
 * ```
 */
folders.delete("/:id", async (c) => {
    // 创建 Supabase 客户端实例
    const supabase = createSupabaseClient(
        c.env.SUPABASE_URL,
        c.env.SUPABASE_ANON_KEY
    );

    // 从认证中间件设置的上下文中获取用户信息
    const user = c.get('user');
    const folderId = c.req.param("id");

    // 检查文件夹是否存在且属于当前用户
    const { data: folder, error: checkError } = await supabase
        .from('folders')
        .select('id, name')
        .eq('id', folderId)
        .eq('user_id', user.id)
        .single();

    if (checkError || !folder) {
        return c.json({ error: '文件夹不存在或无权限访问' }, 404);
    }

    // 获取将要受影响的文档数量（包括子文件夹中的文档）
    const { count: affectedDocuments } = await supabase
        .from('documents')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .or(`folder_id.eq.${folderId},parent_id.folder_id.eq.${folderId}`); // 这里需要更复杂的查询

    // 删除文件夹（包括子文件夹，由于 CASCADE 约束）
    const { error } = await supabase
        .from('folders')
        .delete()
        .eq('id', folderId)
        .eq('user_id', user.id);

    // 处理数据库删除错误
    if (error) {
        return c.json({ error: error.message }, 500);
    }

    // 返回删除成功消息
    return c.json({
        message: `文件夹 "${folder.name}" 已删除`,
        affected_documents: affectedDocuments || 0
    });
});

/**
 * 导出文件夹管理路由模块
 * 供主应用文件挂载使用
 */
export default folders;