-- Superusuário: entra e configura tudo, sem depender das permissões por módulo.
ALTER TABLE "admin_users" ADD COLUMN "superusuario" BOOLEAN NOT NULL DEFAULT false;
