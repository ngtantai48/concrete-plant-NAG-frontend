"use client";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

const SEARCH_FIELDS = ["user_full_name", "username", "user_phone_number", "user_email"] as const;

export type UserSearchField = (typeof SEARCH_FIELDS)[number];

export default function UserSearch() {
  const t = useTranslations("UserManage");
  const tCommon = useTranslations("Common");
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { replace } = useRouter();

  const currentSearchField = (searchParams.get("searchField") || "user_full_name") as UserSearchField;
  const currentQuery = searchParams.get("query") || "";
  const [searchValue, setSearchValue] = useState(currentQuery);

  const searchFields: Record<UserSearchField, string> = {
    user_full_name: t("full_name"),
    username: t("username"),
    user_phone_number: t("phone_number"),
    user_email: t("email"),
  };

  const searchPlaceholders: Record<UserSearchField, string> = {
    user_full_name: t("searchByName"),
    username: t("searchByUsername"),
    user_phone_number: t("searchByPhone"),
    user_email: t("searchByEmail"),
  };

  const updateParams = (field: UserSearchField, query: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("page", "1");
    params.set("searchField", field);

    if (query.trim()) {
      params.set("query", query.trim());
    } else {
      params.delete("query");
    }

    replace(`${pathname}?${params.toString()}`);
  };

  return (
    <ButtonGroup className="w-full max-w-3xl flex-col sm:flex-row">
      <Select
        value={currentSearchField}
        onValueChange={(value: UserSearchField) => updateParams(value, searchValue)}
      >
        <SelectTrigger className="sm:w-[180px] bg-white">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SEARCH_FIELDS.map((field) => (
            <SelectItem key={field} value={field}>
              {searchFields[field]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        value={searchValue}
        onChange={(event) => setSearchValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") updateParams(currentSearchField, searchValue);
        }}
        className="flex-1"
        placeholder={searchPlaceholders[currentSearchField]}
      />

      <Button
        type="button"
        onClick={() => updateParams(currentSearchField, searchValue)}
        className="sm:w-auto w-full"
      >
        {tCommon("search")}
      </Button>
    </ButtonGroup>
  );
}
