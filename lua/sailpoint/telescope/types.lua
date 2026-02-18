local config = require("sailpoint.config")
local state = require("sailpoint.state")
local utils = require("sailpoint.utils")
local common = require("sailpoint.telescope.common")

local M = {}

local function clear_resource_cache(res_type)
	state.set_cache(res_type, nil)
end

function M.pick_resource_type(extra_opts)
	if config.is_active then
		return
	end
	local telescope_modules = common.load_telescope_modules()
	if not telescope_modules then
		return
	end
	config.is_active = true
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
				prompt_title = "SailPoint Resources",
				finder = finders.new_table({
					results = config.all_types,
					entry_maker = function(entry)
						return { value = entry, display = entry.name, ordinal = entry.name }
					end,
				}),
				sorter = conf.generic_sorter({}),
				previewer = previewers.new_buffer_previewer({
					define_preview = function(self, entry, status)
						local res_type = entry.value.id
						local bufnr = self.state.bufnr
						vim.api.nvim_win_set_option(self.state.winid, "wrap", true)
						if config.cache[res_type] then
							vim.api.nvim_buf_set_option(bufnr, "modifiable", true)
							vim.api.nvim_buf_set_lines(bufnr, 0, -1, false, config.cache[res_type])
							vim.api.nvim_buf_set_option(bufnr, "modifiable", false)
						else
							vim.api.nvim_buf_set_option(bufnr, "modifiable", true)
							vim.api.nvim_buf_set_lines(
								bufnr,
								0,
								-1,
								false,
								{ "Preview loads after selecting a resource type." }
							)
							vim.api.nvim_buf_set_option(bufnr, "modifiable", false)
						end
					end,
				}),
				attach_mappings = function(prompt_bufnr, map)
					t_actions.select_default:replace(function()
						local selection = action_state.get_selected_entry()
						if not selection then
							return
						end
						local res_type = selection.value.id

						if res_type == "tenants" then
							local items, _ = common.safe_fetch_items("tenants")
							if not items or #items == 0 then
								on_close(prompt_bufnr)
									vim.schedule(function()
										utils.run_user_command("SailPointAdd", { "tenant" })
									end)
								return
							end
						end

						if
							res_type ~= "tenants"
							and config.cache[res_type]
							and config.cache[res_type][1]
							and config.cache[res_type][1]:find("No tenants")
						then
							utils.notify_warn("Please add a tenant.")
							return
						end

						if config.cache[res_type] and config.cache[res_type][1] and config.cache[res_type][1]:find("Error") then
							clear_resource_cache(res_type)
						end

						on_close(prompt_bufnr)
						vim.schedule(function()
							require("sailpoint.telescope.items").sailpoint_telescope(res_type, nil, extra_opts)
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
end

return M
