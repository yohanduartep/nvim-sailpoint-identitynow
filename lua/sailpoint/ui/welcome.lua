local M = {}

M.wave_timer = nil

function M.show_welcome()
	if M.wave_timer then
		M.wave_timer:stop()
		M.wave_timer = nil
	end

	local buf = vim.api.nvim_create_buf(false, true)
	local logo = {
		"                                       S E T  S A I L",
		"                                                                                         ",
		"                                                                                         ",
		"                                                  =                                      ",
		"                                                 %=                                      ",
		"                                                 %%=                                     ",
		"                                                 %%=                                     ",
		"                                                 %%==                                    ",
		"                                                 %%%==                                   ",
		"                                                 %%%==                                   ",
		"                                                 %%%%==                                  ",
		"                                                 %%%%%==                                 ",
		"                                                 %%%%%%==                                ",
		"                                                %%%%%%%%==                               ",
		"                                               %%%%%%%%%====                             ",
		"                                              %%%%%%%%%%%====                            ",
		"                                            %%%%%%%%%%%%%%====                           ",
		"                                         %%%%%%%%%%%%%%%%%%%====                         ",
		"                                     %%%%%%%%%%%%%%%%%%%%%%%%=====                       ",
		"                                 %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%======                    ",
		"                            %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%=====                 ",
		"                       %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%======              ",
		"                           +++++++++++++++++++++++++++++++++++++++::::::                 ",
		"                                    +++++++++++++++++++++++++++:::::                     ",
		"                                          +++++++++++++++++++::::                        ",
		"                                               +++++++++++++:::                          ",
		"                                                     ++++++::                            ",
		"                                                        ++:                              ",
		"                                                         +                               ",
		[[                    _____________________________________))_______________/             ]],
		[[                    \..................................................../              ]],
		[[                     \__________________________________________________/               ]],
		"~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~",
	}

	local static_lines = {}
	for i, line in ipairs(logo) do
		static_lines[i] = line
	end

	local wave_line_idx = 32
	local wave_pattern = "~~~~~~~        "
	local wave_str = ""
	while #wave_str < 89 do
		wave_str = wave_str .. wave_pattern
	end
	wave_str = wave_str:sub(1, 89)
	logo[32] = wave_str

	vim.api.nvim_buf_set_lines(buf, 0, -1, false, logo)
	vim.api.nvim_buf_set_option(buf, "buftype", "nofile")
	vim.api.nvim_buf_set_option(buf, "bufhidden", "wipe")
	vim.api.nvim_buf_set_option(buf, "modifiable", false)
	vim.api.nvim_buf_set_option(buf, "filetype", "sailpoint-welcome")

	local win = vim.api.nvim_get_current_win()
	vim.api.nvim_win_set_buf(win, buf)

	local clouds = {
		{
			row = 2,
			offset = 0,
			speed = 1,
			art = {
				"      ____      ",
				"   __(    )__   ",
				"  (          )  ",
				" (____________) ",
			},
		},
		{
			row = 15,
			offset = 45,
			speed = 0.5,
			art = {
				"         ________         ",
				"      __(        )__      ",
				"     (              )     ",
				"    (________________)    ",
			},
		},
	}

	M.wave_timer = vim.loop.new_timer()
	M.wave_timer:start(
		0,
		300,
		vim.schedule_wrap(function()
			if not vim.api.nvim_buf_is_valid(buf) then
				if M.wave_timer then
					M.wave_timer:stop()
					M.wave_timer = nil
				end
				return
			end

			wave_str = wave_str:sub(2) .. wave_str:sub(1, 1)

			local current_lines = {}
			local max_width = 89
			for i, line in ipairs(static_lines) do
				current_lines[i] = line
			end
			current_lines[wave_line_idx + 1] = wave_str

			for _, c in ipairs(clouds) do
				c.offset = (c.offset + c.speed) % max_width
				local pos = max_width - math.floor(c.offset)
				for i, art_line in ipairs(c.art) do
					local target_row = c.row + i - 1
					local line = current_lines[target_row]
					if line then
						local new_line = ""
						for char_idx = 1, max_width do
							local art_char_idx = char_idx - pos + 1
							if art_char_idx >= 1 and art_char_idx <= #art_line then
								local char = art_line:sub(art_char_idx, art_char_idx)
								if char ~= " " and line:sub(char_idx, char_idx) == " " then
									new_line = new_line .. char
								else
									new_line = new_line .. line:sub(char_idx, char_idx)
								end
							else
								new_line = new_line .. line:sub(char_idx, char_idx)
							end
						end
						current_lines[target_row] = new_line
					end
				end
			end

			vim.api.nvim_buf_set_option(buf, "modifiable", true)
			vim.api.nvim_buf_set_lines(buf, 0, -1, false, current_lines)
			vim.api.nvim_buf_set_option(buf, "modifiable", false)
		end)
	)

	vim.api.nvim_create_autocmd("BufDelete", {
		buffer = buf,
		callback = function()
			if M.wave_timer then
				M.wave_timer:stop()
				M.wave_timer = nil
			end
		end,
	})

	vim.cmd([[syntax match SailPointBoat /\\/]])
	vim.cmd([[syntax match SailPointBoat /\//]])
	vim.cmd([[syntax match SailPointBoat /|/]])
	vim.cmd([[syntax match SailPointBoat /[()]/]])
	vim.cmd([[syntax match SailPointBoat /_\+/]])
	vim.cmd([[syntax match SailPointBoatFill /\.\+/]])

	vim.cmd([[syntax match SailPointBlue /%\+/]])
	vim.cmd([[syntax match SailPointPink /=\+/]])
	vim.cmd([[syntax match SailPointLightBlue /[+]\+/]])
	vim.cmd([[syntax match SailPointLightPink /[:\-]\+/]])

	vim.cmd([[syntax match SailPointText /S E T  S A I L/]])
	vim.cmd([[syntax match SailPointWaves /[~]\+/]])

	vim.cmd("highlight SailPointBoat guifg=#ffffff ctermfg=15")
	vim.cmd("highlight SailPointBoatFill guifg=#ffffff ctermfg=15")
	vim.cmd("highlight SailPointWaves guifg=#85d7ff")
	vim.cmd("highlight SailPointBlue guifg=#0071ce")
	vim.cmd("highlight SailPointPink guifg=#ff007b")
	vim.cmd("highlight SailPointLightBlue guifg=#85d7ff")
	vim.cmd("highlight SailPointLightPink guifg=#ffb2d1")
	vim.cmd("highlight SailPointText guifg=#0071ce gui=bold")
end

return M
