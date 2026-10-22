package com.github.yhk1038.claudecodegui.bridge

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class OpenFileTargetsTest {

    private val wslProject = "\\\\wsl\$\\Ubuntu\\home\\me\\proj"
    private val modernWslProject = "\\\\wsl.localhost\\Ubuntu\\home\\me\\proj"

    @Test
    fun `a path is always its own first candidate`() {
        assertEquals(listOf("C:/Users/me/x.png"), OpenFileTargets.candidates("C:/Users/me/x.png", "C:/proj", true))
    }

    @Test
    fun `a WSL mount of a Windows drive also names the drive path`() {
        assertEquals(
            listOf("/mnt/c/Users/me/x.png", "C:/Users/me/x.png"),
            OpenFileTargets.candidates("/mnt/c/Users/me/x.png", null, true),
        )
    }

    @Test
    fun `a Linux path in a WSL project also names the UNC path with the project's host spelling`() {
        assertEquals(
            listOf("/home/me/proj/x.png", "//wsl\$/Ubuntu/home/me/proj/x.png"),
            OpenFileTargets.candidates("/home/me/proj/x.png", wslProject, true),
        )
        assertEquals(
            listOf("/home/me/proj/x.png", "//wsl.localhost/Ubuntu/home/me/proj/x.png"),
            OpenFileTargets.candidates("/home/me/proj/x.png", modernWslProject, true),
        )
    }

    @Test
    fun `a Linux path outside a WSL project has no UNC spelling`() {
        assertEquals(listOf("/home/me/x.png"), OpenFileTargets.candidates("/home/me/x.png", "C:/proj", true))
        assertEquals(listOf("/home/me/x.png"), OpenFileTargets.candidates("/home/me/x.png", null, true))
    }

    @Test
    fun `only a Windows IDE has anything to translate`() {
        assertEquals(listOf("/mnt/c/Users/me/x.png"), OpenFileTargets.candidates("/mnt/c/Users/me/x.png", null, false))
        assertEquals(listOf("/home/me/proj/x.png"), OpenFileTargets.candidates("/home/me/proj/x.png", wslProject, false))
    }

    @Test
    fun `a UNC path is never rewritten as a Linux path`() {
        assertEquals(
            listOf("//wsl\$/Ubuntu/home/me/x.png"),
            OpenFileTargets.candidates("//wsl\$/Ubuntu/home/me/x.png", wslProject, true),
        )
    }
}
