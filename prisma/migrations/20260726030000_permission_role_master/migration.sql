CREATE TABLE "PermissionRole" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "baseRole" "UserRole" NOT NULL DEFAULT 'VIEWER',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PermissionRole_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PermissionRole_code_key" ON "PermissionRole"("code");
CREATE INDEX "PermissionRole_baseRole_idx" ON "PermissionRole"("baseRole");
CREATE INDEX "PermissionRole_isActive_idx" ON "PermissionRole"("isActive");

ALTER TABLE "AppUser" ADD COLUMN "permissionRoleId" TEXT;
CREATE INDEX "AppUser_permissionRoleId_idx" ON "AppUser"("permissionRoleId");

ALTER TABLE "RolePermission" ADD COLUMN "permissionRoleId" TEXT;
ALTER TABLE "RolePermission" ALTER COLUMN "role" DROP NOT NULL;
CREATE UNIQUE INDEX "RolePermission_permissionRoleId_menu_key" ON "RolePermission"("permissionRoleId", "menu");
CREATE INDEX "RolePermission_permissionRoleId_idx" ON "RolePermission"("permissionRoleId");

ALTER TABLE "AppUser" ADD CONSTRAINT "AppUser_permissionRoleId_fkey"
  FOREIGN KEY ("permissionRoleId") REFERENCES "PermissionRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionRoleId_fkey"
  FOREIGN KEY ("permissionRoleId") REFERENCES "PermissionRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;
