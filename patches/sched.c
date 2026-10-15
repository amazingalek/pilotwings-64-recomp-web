// The scheduler's watchdog, taken out.
//
// On every retrace the game's scheduler counts how long the RSP and the RDP have
// been busy, and if the RDP is still on a frame 50 retraces after the RSP finished
// (or the RSP 51 after it started) it takes the frame for lost: it sends itself
// the done message the RCP never sent, or resets the RSP, and goes on to the next
// frame. On the N64 a frame takes a few milliseconds, so this only ever caught a
// crashed display list.
//
// In the port a frame can take seconds: on the web page RT64 holds the frame that
// first needs shaders the page hasn't built until they are (25 s for the title
// and menus in Firefox). The watchdog then finishes the frame on its own, and the
// game builds the next frames into the display list buffers RT64 hasn't read yet;
// when RT64 reads them, it finds a mix of two frames' commands. On the page that
// was a palette load past the end of memory or a texture 8404 texels wide, and
// the page stopped. So the port waits for the frame however long it takes, as
// the runtime always finishes it.
//
// The decompilation's _uvScHandleRetrace (src/kernel/sched.c) without the two
// timeouts.

#include "patches.h"

#include "uv_clocks.h"
#include "uv_sched.h"

extern OSScTask* D_802B9C58;
extern OSScTask* D_802B9C60[2];
extern u8 D_802B9C68;
extern u8 gSchedRspStatus;
extern u8 gSchedRdpStatus;
extern u8 D_802B9C6B;
extern u8 D_802B9C6C;
extern u8 D_802B9C6D;
extern u8 D_802B9C6E;
extern u8 D_802B9C6F;
extern u8 D_802B9C70;
extern s32 gNmiAsserted;
extern s32 D_802B9C84;

RECOMP_PATCH void _uvScHandleRetrace(void) {
    OSScTask* msg;
    u32 taskType;
    OSScClient* var_s0;

    msg = NULL;
    uvClkUpdate();
    if (gNmiAsserted == 0) {
        D_802B9C84 = 1;
        if (gSchedRspStatus) {
            D_802B9C70 += 1;
        } else {
            D_802B9C70 = 0;
        }

        if (gSchedRdpStatus) {
            D_802B9C6F += 1;
        } else {
            D_802B9C6F = 0;
        }
        if (gSchedRspStatus == 'a') {
            _uvDebugPrintf("_uvScHandleRetrace: audio still busy\n");
            return;
        }
        if (D_802B9C68 != 0) {
            D_802B9C68 = 0;
            uvSc_8022C34C();
            D_802B9C6E ^= 1;
        }

        while (osRecvMesg(&gSchedInst.cmdQ, (OSMesg)&msg, OS_MESG_NOBLOCK) != -1) {
            if (msg == NULL) {
                _uvDebugPrintf("received message with task of 0\n");
                break;
            }
            taskType = msg->list.t.type;
            if (taskType == M_GFXTASK) {
                D_802B9C60[D_802B9C6D] = msg;
                D_802B9C6D ^= 1;
            } else if (taskType == M_AUDTASK) {
                D_802B9C58 = msg;
            } else {
                _uvDebugPrintf("_uvScHandleRetrace: unkown task type 0x%x\n", msg);
            }
        }

        if (D_802B9C58 != NULL) {
            if (gSchedRspStatus == 'g') {
                if (D_802B9C6C != 0) {
                    _uvDebugPrintf("_uvScHandleRetrace:  2nd yield\n");
                }
                if (D_802B9C6B != 0) {
                    _uvDebugPrintf("_uvScHandleRetrace: gfx task didn't yield\n");
                    _uvScDlistRecover();
                    return;
                }
                D_802B9C6B = 1;
                uvSc_8022C3C0(1, 0x31);
                osSpTaskYield();
            } else {
                _uvScRunAud();
            }
        } else if (D_802B9C60[D_802B9C6E] != NULL) {
            _uvScRunGfx();
        }
        var_s0 = gSchedInst.clientList;
        while (var_s0 != NULL) {
            osSendMesg(var_s0->msgQ, &gSchedInst, 0);
            var_s0 = var_s0->next;
        }
    }
}
