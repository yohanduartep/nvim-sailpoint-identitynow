--- Action handlers for opening resources in SailPoint
--- Provides functionality to open resources based on their type and configuration
--- Implements Strategy pattern for different opening methods (command, raw path)
local config = require("sailpoint.config")
local utils = require("sailpoint.utils")
local window_manager = require("sailpoint.ui.window_manager")

local M = {}

--- Ensure a valid target window exists (not sidebar)
local function ensure_non_sidebar_target_window()
	return window_manager.ensure_non_sidebar_target_window()
end

--- Open a SailPoint resource in the UI
--- Determines how to open the resource based on its type definition and configuration
--- Supports three opening strategies: command, raw path, or fallback
function M.open_resource(res_type, id, matched_field)
	local res_def = nil
	for _, d in ipairs(config.all_types) do
		if d.id == res_type then
			res_def = d
			break
		end
	end

	if not res_def then
		if not id or id == "" then
			utils.notify_error("SailPoint: No valid ID for " .. res_type)
			return
		end
		local path = "/" .. res_type .. "s/" .. id
		local target_win = ensure_non_sidebar_target_window()
		vim.fn.SailPointRawWithFallback(path, path, res_type, id, matched_field or "", target_win)
		return
	end

	local openConfig = res_def.openConfig
	if not openConfig then
		utils.notify_error("SailPoint: No open configuration for " .. res_type)
		return
	end

	local tenant = vim.fn.SailPointGetActiveTenant()
	local version = tenant and type(tenant) == "table" and tenant.version
	if not version or version == "" then
		utils.notify_error("SailPoint: Active tenant has no API version configured.")
		return
	end

	local target_win = ensure_non_sidebar_target_window()
	if openConfig.type == "command" then
		if not openConfig.command or openConfig.command == "" then
			utils.notify_error("SailPoint: Missing command for " .. res_type)
			return
		end
		if not id or id == "" then
			utils.notify_error("SailPoint: Item has no valid ID for command open (" .. res_type .. ").")
			return
		end
		utils.run_user_command(openConfig.command, { id, matched_field or "", target_win })
		return
	end

	if not openConfig.path or openConfig.path == "" then
		utils.notify_error("SailPoint: Missing path configuration for " .. res_type)
		return
	end

	local path, fallback, path_err = utils.build_open_paths(openConfig, version, id)
	if path_err then
		utils.notify_error("SailPoint: " .. path_err)
		return
	end
	vim.fn.SailPointRawWithFallback(path, fallback, res_type, id or res_type, matched_field or "", target_win)
end

return M
