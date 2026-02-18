local config = require("sailpoint.config")
local state = require("sailpoint.state")
local utils = require("sailpoint.utils")
local actions = require("sailpoint.actions")
local common = require("sailpoint.telescope.common")

local M = {}

local function clear_resource_cache(res_type)
	state.set_cache(res_type, nil)
end

local function clear_all_cache()
	state.clear_cache()
end

function M.sailpoint_telescope(res_type, query, extra_opts)
	if config.is_active then
		return
	end
	local telescope_modules = common.load_telescope_modules()
	if not telescope_modules then
		return
	end

	config.is_active = true
	clear_resource_cache(res_type)
	local result, err = common.safe_fetch_items(res_type)

	local items = result
	if type(result) == "table" and result.items then
		items = result.items
	end

	if err or not items or #items == 0 then
		config.is_active = false
		utils.notify_warn("SailPoint: " .. (err or "No items found."))
		return false
	end

	local pickers = telescope_modules.pickers
	local finders = telescope_modules.finders
	local conf = telescope_modules.conf
	local t_actions = telescope_modules.actions
	local action_state = telescope_modules.action_state
	local previewers = telescope_modules.previewers
	local picker_opts = common.build_picker_opts(extra_opts)

	local on_close = common.make_on_close(t_actions)

	local ok, _ = pcall(function()
		pickers
			.new(picker_opts, {
				prompt_title = "SailPoint " .. res_type:gsub("-", " "):gsub("^%l", string.upper),
				finder = finders.new_table({
					results = items,
					entry_maker = function(entry)
						local display = utils.resource_label(entry)
						if res_type == "tenants" and entry.isActive then
							display = display .. " *"
						end
						return {
							value = entry,
							display = display .. " (ID: " .. (entry.id or "N/A") .. ")",
							ordinal = display,
						}
					end,
				}),
				sorter = conf.generic_sorter({}),
				previewer = previewers.new_buffer_previewer({
					define_preview = function(self, entry, status)
						common.set_preview_content(self.state.bufnr, entry.value, self.state.winid, true)
					end,
				}),
				attach_mappings = function(prompt_bufnr, map)
					local function open_selection()
						local selection = action_state.get_selected_entry()
						if not selection then
							return
						end
						local id = selection.value.id
						local target_type = selection.value.resource_type or res_type
						local matchedField = selection.value.matchedField

						if target_type == "tenants" then
							on_close(prompt_bufnr)
							utils.run_user_command("SPISwitchTenant", { id })
							clear_all_cache()
							vim.schedule(function()
								require("sailpoint.telescope.types").pick_resource_type(extra_opts)
							end)
							return
						end

						on_close(prompt_bufnr)
						vim.schedule(function()
							actions.open_resource(target_type, id, matchedField)
						end)
					end

					t_actions.select_default:replace(open_selection)

					map("i", "<BS>", function()
						if action_state.get_current_line() == "" then
							on_close(prompt_bufnr)
							vim.schedule(function()
								require("sailpoint.telescope.types").pick_resource_type(extra_opts)
							end)
						else
							vim.api.nvim_feedkeys(vim.api.nvim_replace_termcodes("<BS>", true, false, true), "n", true)
						end
					end)

					map("n", "<BS>", function()
						on_close(prompt_bufnr)
						vim.schedule(function()
							require("sailpoint.telescope.types").pick_resource_type(extra_opts)
						end)
					end)

					common.attach_standard_close_mappings(map, on_close, prompt_bufnr)

					return true
				end,
			})
			:find()
	end)

	if not ok then
		config.is_active = false
	end
	return true
end

return M
