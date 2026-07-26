CREATE TYPE "PermissionMenu" AS ENUM ('PAYROLL', 'SES');

CREATE TABLE "RolePermission" (
  "id" TEXT NOT NULL,
  "role" "UserRole" NOT NULL,
  "menu" "PermissionMenu" NOT NULL,
  "canShow" BOOLEAN NOT NULL DEFAULT true,
  "canView" BOOLEAN NOT NULL DEFAULT true,
  "canEdit" BOOLEAN NOT NULL DEFAULT false,
  "canViewAll" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RolePermission_role_menu_key" ON "RolePermission"("role", "menu");
CREATE INDEX "RolePermission_role_idx" ON "RolePermission"("role");
CREATE INDEX "RolePermission_menu_idx" ON "RolePermission"("menu");
