-- 创建文件夹表
CREATE TABLE folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    user_id UUID NOT NULL,
    parent_id UUID REFERENCES folders(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建文档表（如果不存在的话，这是现有结构的升级版）
-- 注意：如果 documents 表已存在，需要使用 ALTER TABLE 语句

-- 为文档表添加文件夹关联字段（如果表已存在）
ALTER TABLE documents ADD COLUMN folder_id UUID REFERENCES folders(id) ON DELETE SET NULL;

-- 为 documents 表添加索引以提高查询性能
CREATE INDEX idx_documents_user_id ON documents(user_id);
CREATE INDEX idx_documents_folder_id ON documents(folder_id);
CREATE INDEX idx_documents_user_folder ON documents(user_id, folder_id);
CREATE INDEX idx_documents_updated_at ON documents(updated_at DESC);

-- 为 folders 表添加索引
CREATE INDEX idx_folders_user_id ON folders(user_id);
CREATE INDEX idx_folders_parent_id ON folders(parent_id);
CREATE INDEX idx_folders_user_parent ON folders(user_id, parent_id);

-- 创建一个默认的"根目录"文件夹函数（可选）
-- 这个函数可以为没有文件夹的文档提供默认的根目录
CREATE OR REPLACE FUNCTION get_or_create_default_folder(user_uuid UUID)
RETURNS UUID AS $$
DECLARE
    folder_id UUID;
BEGIN
    -- 尝试获取用户的默认文件夹
    SELECT id INTO folder_id
    FROM folders
    WHERE user_id = user_uuid AND name = '默认文件夹' AND parent_id IS NULL
    LIMIT 1;

    -- 如果不存在，创建一个
    IF folder_id IS NULL THEN
        INSERT INTO folders (name, user_id, parent_id)
        VALUES ('默认文件夹', user_uuid, NULL)
        RETURNING id INTO folder_id;
    END IF;

    RETURN folder_id;
END;
$$ LANGUAGE plpgsql;

-- 添加注释
COMMENT ON TABLE folders IS '文档文件夹表，支持层级结构';
COMMENT ON TABLE documents IS '文档表，支持文件夹分类';
COMMENT ON COLUMN documents.folder_id IS '文档所属文件夹ID，可为空表示未分类';
COMMENT ON COLUMN folders.parent_id IS '父文件夹ID，可为空表示根目录文件夹';
COMMENT ON COLUMN folders.name IS '文件夹名称，在同一父文件夹下必须唯一';