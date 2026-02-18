local utils = require("sailpoint.utils")
local actions = require("sailpoint.actions")
local common = require("sailpoint.telescope.common")

local M = {}

function M.telescope_search()
	local telescope_modules = common.load_telescope_modules()
	if not telescope_modules then
		return
	end

	local pickers = telescope_modules.pickers
	local finders = telescope_modules.finders
	local conf = telescope_modules.conf
	local t_actions = telescope_modules.actions
	local action_state = telescope_modules.action_state
	local previewers = telescope_modules.previewers

	pickers
		.new({}, {
			prompt_title = "SailPoint Global Search",
			finder = finders.new_dynamic({
				fn = function(prompt)
					if not prompt or prompt == "" then
						return {}
					end
					local ok, result = pcall(vim.fn.SailPointFetchItems, "search", "all " .. prompt)
					if ok and type(result) == "table" and result.items then
						return result.items
					end
					return {}
				end,
				entry_maker = function(entry)
					local name = utils.resource_label(entry)
					local type_label = entry.resource_type or "unknown"
					local source_label = entry.source_display_name and (" [" .. entry.source_display_name .. "]") or ""

					return {
						value = entry,
						display = string.format("%-15s | %s%s", type_label, name, source_label),
						ordinal = name .. " " .. type_label .. " " .. (entry.source_display_name or ""),
					}
				end,
			}),
			sorter = conf.generic_sorter({}),
			previewer = previewers.new_buffer_previewer({
				define_preview = function(self, entry, status)
					common.set_preview_content(self.state.bufnr, entry.value, self.state.winid, false)
				end,
			}),
				attach_mappings = function(prompt_bufnr, map)
					t_actions.select_default:replace(function()
						local selection = action_state.get_selected_entry()
						if not selection then
							return
						end
						t_actions.close(prompt_bufnr)
						vim.schedule(function()
							actions.open_resource(selection.value.resource_type, selection.value.id, selection.value.matchedField)
						end)
					end)
					return true
				end,
		})
		:find()
end

return M
