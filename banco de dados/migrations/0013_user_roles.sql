UPDATE users
SET role = CASE
    WHEN lower(trim(role)) = 'admin' THEN 'admin'
    WHEN lower(trim(role)) = 'comercial' THEN 'comercial'
    ELSE 'user'
END;
