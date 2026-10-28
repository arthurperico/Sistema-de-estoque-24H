ALTER TABLE other_items ADD COLUMN category TEXT NOT NULL DEFAULT 'Outros';
UPDATE other_items SET category = 'Outros' WHERE category IS NULL OR TRIM(category) = '';
