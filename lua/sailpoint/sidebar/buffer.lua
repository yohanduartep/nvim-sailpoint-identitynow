local M = {}

function M.find_sidebar_buffer()
	for _, win in ipairs(vim.api.nvim_tabpage_list_wins(0)) do
		local buf = vim.api.nvim_win_get_buf(win)
		if vim.api.nvim_buf_is_valid(buf) and vim.bo[buf].filetype == "sailpoint-sidebar" then
			return buf
		end
	end
	return nil
end

function M.get_buffer_width(bufnr)
	local win = vim.fn.bufwinid(bufnr)
	if win == -1 then
		return 80
	end
	return vim.api.nvim_win_get_width(win)
end

function M.setup_buffer_options(bufnr)
	vim.bo[bufnr].filetype = "sailpoint-sidebar"
	vim.bo[bufnr].buftype = "nofile"
	vim.bo[bufnr].swapfile = false
	vim.bo[bufnr].bufhidden = "hide"
end

function M.setup_keymaps(bufnr, callbacks)
	vim.api.nvim_buf_set_keymap(bufnr, "n", "<CR>", "", {
		callback = callbacks.on_click,
		noremap = true,
		silent = true,
	})
	vim.api.nvim_buf_set_keymap(bufnr, "n", "o", "", {
		callback = callbacks.on_click,
		noremap = true,
		silent = true,
	})
	vim.api.nvim_buf_set_keymap(bufnr, "n", "<Tab>", "", {
		callback = callbacks.on_switch_tenant,
		noremap = true,
		silent = true,
	})
	vim.api.nvim_buf_set_keymap(bufnr, "n", "s", "", {
		callback = callbacks.on_search,
		noremap = true,
		silent = true,
	})
end

function M.set_lines(bufnr, lines)
	vim.api.nvim_buf_set_option(bufnr, "modifiable", true)
	vim.api.nvim_buf_set_lines(bufnr, 0, -1, false, lines)
	vim.api.nvim_buf_set_option(bufnr, "modifiable", false)
end

return M
